"""
preprocess.py — Audio preprocessing utilities for Keyword Spotting (KWS)

WHAT GOES IN THIS FILE
- Load .wav files from class folders (help_en, udaw, udaw_karanna, beraganna, budu_ammo, unknown, noise)
- Standardize audio:
  - mono
  - 16 kHz sample rate
  - fixed duration (e.g., 1.0s or 1.5s) via pad/trim
- Convert audio waveform -> features:
  - log-mel spectrogram (recommended) or MFCC
- Normalize features (per-sample normalization)
- Build tf.data datasets:
  - train/val/test split
  - batching + prefetch
- (Optional) Data augmentation functions:
  - random gain
  - time shift
  - mix background noise
  - add gaussian noise

WHAT SHOULD NOT GO IN THIS FILE
- Model architecture (CNN layers)
- Training loop / optimizer / callbacks
- Evaluation metrics / confusion matrix

OUTPUTS / INTERFACES THIS FILE SHOULD PROVIDE
- CLASS_NAMES list and label mapping {class_name: index}
- create_dataset(data_dir, split, batch_size, seed, augment=bool) -> tf.data.Dataset
- wav_to_features(wav) -> feature tensor [time, mel, 1]

NOTES FOR MOBILE (IMPORTANT)
- Keep preprocessing consistent with Flutter inference.
- Decide feature parameters now (sample_rate, window_size, hop_size, mel_bins) and do not change casually.


Folder layout expected:
ML/KWS/
  data/
    help_en/
    udaw/
    udaw_karanna/
    beraganna/
    budu_ammo/
    unknown/
    noise/
  scripts/
    preprocess.py
    train_kws.py
    evaluate.py

"""



from __future__ import annotations

import os
from pathlib import Path
from typing import Dict, List, Tuple, Optional

import tensorflow as tf


# -----------------------------
# Config (keep stable!)
# -----------------------------
TARGET_SR = 16000
CLIP_SECONDS = 1.0  # 1.0 sec is common for KWS
N_SAMPLES = int(TARGET_SR * CLIP_SECONDS)

FRAME_LENGTH = 400   # 25ms at 16kHz
FRAME_STEP = 160     # 10ms hop at 16kHz
FFT_LENGTH = 512

NUM_MEL_BINS = 40
LOWER_FREQ = 80.0
UPPER_FREQ = 7600.0

EPS = 1e-6


def get_default_class_names() -> List[str]:
    """
    Keep class order stable (important for training + Flutter).
    """
    return [
        "help_en",
        "udaw",
        "udaw_karanna",
        "beraganna",
        "budu_ammo",
        "unknown",
        "noise",
    ]


def ensure_dirs_exist(*paths: str) -> None:
    for p in paths:
        os.makedirs(p, exist_ok=True)


def list_wav_files_by_class(data_dir: str, class_names: List[str]) -> Dict[str, List[str]]:
    data_path = Path(data_dir)
    out: Dict[str, List[str]] = {}
    for cls in class_names:
        cls_dir = data_path / cls
        if not cls_dir.exists():
            raise FileNotFoundError(f"Missing folder: {cls_dir}")
        files = sorted(str(p) for p in cls_dir.glob("*.wav"))
        out[cls] = files
    return out


def split_paths(
    files_by_class: Dict[str, List[str]],
    seed: int = 42,
    train_ratio: float = 0.8,
    val_ratio: float = 0.1,
) -> Tuple[List[str], List[int], List[str], List[int], List[str], List[int]]:
    """
    Stratified split per class into train/val/test.
    Returns (train_paths, train_labels, val_paths, val_labels, test_paths, test_labels).
    """
    if train_ratio <= 0 or val_ratio < 0 or (train_ratio + val_ratio) >= 1.0:
        raise ValueError("Invalid split ratios. Need train_ratio>0, val_ratio>=0, train+val<1")

    rng = tf.random.Generator.from_seed(seed)

    train_p, train_y = [], []
    val_p, val_y = [], []
    test_p, test_y = [], []

    class_names = list(files_by_class.keys())
    class_to_idx = {c: i for i, c in enumerate(class_names)}

    for cls, files in files_by_class.items():
        if len(files) == 0:
            continue

        # Shuffle deterministically using TF generator
        idxs = tf.range(len(files), dtype=tf.int32)
        idxs = tf.random.shuffle(idxs, seed=seed)
        files_shuf = [files[int(i)] for i in idxs.numpy().tolist()]

        n = len(files_shuf)
        n_train = int(n * train_ratio)
        n_val = int(n * val_ratio)
        n_test = n - n_train - n_val

        if n_train == 0 or n_test == 0:
            raise ValueError(
                f"Class '{cls}' has too few files ({n}) for the chosen split. "
                f"Add more samples or adjust ratios."
            )

        cls_idx = class_to_idx[cls]
        train_files = files_shuf[:n_train]
        val_files = files_shuf[n_train:n_train + n_val]
        test_files = files_shuf[n_train + n_val:]

        train_p.extend(train_files)
        train_y.extend([cls_idx] * len(train_files))
        val_p.extend(val_files)
        val_y.extend([cls_idx] * len(val_files))
        test_p.extend(test_files)
        test_y.extend([cls_idx] * len(test_files))

    # Shuffle each split globally
    def _shuffle_in_unison(paths: List[str], labels: List[int]) -> Tuple[List[str], List[int]]:
        if not paths:
            return paths, labels
        idxs = tf.range(len(paths), dtype=tf.int32)
        idxs = tf.random.shuffle(idxs, seed=seed)
        idxs_np = idxs.numpy().tolist()
        return [paths[i] for i in idxs_np], [labels[i] for i in idxs_np]

    train_p, train_y = _shuffle_in_unison(train_p, train_y)
    val_p, val_y = _shuffle_in_unison(val_p, val_y)
    test_p, test_y = _shuffle_in_unison(test_p, test_y)

    return train_p, train_y, val_p, val_y, test_p, test_y


def _read_wav_resample_mono(path: tf.Tensor, target_sr: int = TARGET_SR) -> tf.Tensor:
    """
    Reads a WAV file, converts to mono float32 waveform, resamples to target_sr if needed.
    Returns waveform float32 in [-1, 1].
    """
    audio_bytes = tf.io.read_file(path)
    wav, sr = tf.audio.decode_wav(audio_bytes, desired_channels=1)  # wav: [samples, 1], sr: scalar
    wav = tf.squeeze(wav, axis=-1)  # [samples]
    wav = tf.cast(wav, tf.float32)

    sr = tf.cast(sr, tf.int32)
    target_sr = tf.cast(target_sr, tf.int32)

    def _resample():
        # tf.signal.resample expects known length; we compute new_len dynamically.
        in_len = tf.shape(wav)[0]
        new_len = tf.cast(tf.round(tf.cast(in_len, tf.float32) * (tf.cast(target_sr, tf.float32) / tf.cast(sr, tf.float32))), tf.int32)
        new_len = tf.maximum(new_len, 1)
        return tf.signal.resample(wav, new_len)

    wav = tf.cond(tf.not_equal(sr, target_sr), _resample, lambda: wav)
    return wav


def _pad_or_trim(wav: tf.Tensor, n_samples: int = N_SAMPLES) -> tf.Tensor:
    wav = wav[:n_samples]
    pad_len = n_samples - tf.shape(wav)[0]
    wav = tf.cond(pad_len > 0, lambda: tf.pad(wav, [[0, pad_len]]), lambda: wav)
    return wav


def wav_to_logmel(wav: tf.Tensor) -> tf.Tensor:
    """
    wav: [N_SAMPLES]
    returns: [T, NUM_MEL_BINS, 1] float32
    """
    stft = tf.signal.stft(
        wav,
        frame_length=FRAME_LENGTH,
        frame_step=FRAME_STEP,
        fft_length=FFT_LENGTH,
        window_fn=tf.signal.hann_window,
        pad_end=False,
    )
    spectrogram = tf.abs(stft) ** 2  # power spectrogram

    num_spec_bins = tf.shape(spectrogram)[-1]
    mel_matrix = tf.signal.linear_to_mel_weight_matrix(
        num_mel_bins=NUM_MEL_BINS,
        num_spectrogram_bins=num_spec_bins,
        sample_rate=TARGET_SR,
        lower_edge_hertz=LOWER_FREQ,
        upper_edge_hertz=UPPER_FREQ,
    )
    mel = tf.tensordot(spectrogram, mel_matrix, axes=1)
    mel.set_shape(spectrogram.shape[:-1].concatenate([NUM_MEL_BINS]))

    logmel = tf.math.log(mel + EPS)

    # Per-sample normalization
    mean = tf.reduce_mean(logmel)
    std = tf.math.reduce_std(logmel) + EPS
    logmel = (logmel - mean) / std

    return tf.expand_dims(logmel, axis=-1)  # [T, M, 1]


def augment_wav(
    wav: tf.Tensor,
    noise_paths: Optional[tf.Tensor] = None,
    p_add_noise: float = 0.6,
    max_shift: int = 1600,  # up to 0.1s shift at 16k
    gain_range: Tuple[float, float] = (0.7, 1.3),
) -> tf.Tensor:
    """
    Simple and safe augmentations to reduce false positives:
    - random time shift
    - random gain
    - optionally mix a random noise clip
    """
    # Time shift
    shift = tf.random.uniform([], minval=-max_shift, maxval=max_shift + 1, dtype=tf.int32)
    wav = tf.roll(wav, shift=shift, axis=0)

    # Gain
    gain = tf.random.uniform([], minval=gain_range[0], maxval=gain_range[1], dtype=tf.float32)
    wav = wav * gain
    wav = tf.clip_by_value(wav, -1.0, 1.0)

    # Noise mixing
    if noise_paths is not None:
        r = tf.random.uniform([], 0.0, 1.0)
        def _mix():
            idx = tf.random.uniform([], 0, tf.shape(noise_paths)[0], dtype=tf.int32)
            npath = noise_paths[idx]
            noise = _read_wav_resample_mono(npath, TARGET_SR)
            noise = _pad_or_trim(noise, N_SAMPLES)
            # Mix at random SNR-like factor
            alpha = tf.random.uniform([], 0.02, 0.15)  # small noise factor
            mixed = wav + alpha * noise
            return tf.clip_by_value(mixed, -1.0, 1.0)
        wav = tf.cond(r < p_add_noise, _mix, lambda: wav)

    return wav


def make_tf_dataset(
    paths: List[str],
    labels: List[int],
    batch_size: int,
    training: bool,
    noise_paths_list: Optional[List[str]] = None,
) -> tf.data.Dataset:
    """
    Builds a tf.data.Dataset that yields (features, label).
    """
    if len(paths) != len(labels):
        raise ValueError("paths and labels length mismatch")

    path_ds = tf.data.Dataset.from_tensor_slices((paths, labels))

    if training:
        path_ds = path_ds.shuffle(buffer_size=min(2000, len(paths)), reshuffle_each_iteration=True)

    noise_paths = None
    if noise_paths_list:
        noise_paths = tf.constant(noise_paths_list)

    def _map_fn(path, label):
        wav = _read_wav_resample_mono(path, TARGET_SR)
        wav = _pad_or_trim(wav, N_SAMPLES)

        if training:
            wav = augment_wav(wav, noise_paths=noise_paths)

        feat = wav_to_logmel(wav)
        label = tf.cast(label, tf.int32)
        return feat, label

    ds = path_ds.map(_map_fn, num_parallel_calls=tf.data.AUTOTUNE)
    ds = ds.batch(batch_size, drop_remainder=False).prefetch(tf.data.AUTOTUNE)
    return ds


def create_splits_and_datasets(
    data_dir: str,
    class_names: Optional[List[str]] = None,
    seed: int = 42,
    train_ratio: float = 0.8,
    val_ratio: float = 0.1,
    batch_size: int = 32,
) -> Tuple[tf.data.Dataset, tf.data.Dataset, tf.data.Dataset, List[str]]:
    """
    Returns train_ds, val_ds, test_ds, class_names (in the same order as label indices).
    """
    if class_names is None:
        class_names = get_default_class_names()

    # Keep label order stable based on class_names list (not dict ordering).
    files_by_class_raw = list_wav_files_by_class(data_dir, class_names)

    # We build a dict in the same class order.
    files_by_class = {cls: files_by_class_raw[cls] for cls in class_names}

    train_p, train_y, val_p, val_y, test_p, test_y = split_paths(
        files_by_class,
        seed=seed,
        train_ratio=train_ratio,
        val_ratio=val_ratio,
    )

    # For augmentation we use noise class paths (if present)
    noise_paths_list = files_by_class.get("noise", [])

    train_ds = make_tf_dataset(train_p, train_y, batch_size=batch_size, training=True, noise_paths_list=noise_paths_list)
    val_ds = make_tf_dataset(val_p, val_y, batch_size=batch_size, training=False, noise_paths_list=None)
    test_ds = make_tf_dataset(test_p, test_y, batch_size=batch_size, training=False, noise_paths_list=None)

    return train_ds, val_ds, test_ds, class_names


def get_feature_shape() -> Tuple[int, int, int]:
    """
    Returns the fixed feature shape for the chosen config.
    For 1s @ 16k, frame_length=400, step=160 => T=98
    """
    # Compute frames deterministically:
    # T = floor((N - frame_length)/frame_step) + 1
    t = ((N_SAMPLES - FRAME_LENGTH) // FRAME_STEP) + 1
    return (int(t), int(NUM_MEL_BINS), 1)

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
"""

"""
train_kws.py — Train and export the multilingual KWS model

GOAL
Train ONE multi-class keyword spotting model that recognizes:
- help_en
- udaw
- udaw_karanna
- beraganna
- budu_ammo
and also learns to reject:
- unknown (other speech)
- noise (silence/background)

WHAT GOES IN THIS FILE
- Import preprocessing dataset builder from preprocess.py
- Define model architecture (small CNN) suitable for on-device inference
- Compile model (loss: sparse categorical crossentropy, optimizer Adam)
- Train with callbacks:
  - EarlyStopping
  - ModelCheckpoint
  - ReduceLROnPlateau
- Handle class imbalance:
  - class weights OR balanced sampling
- Save model:
  - SavedModel or .h5
- Export to TFLite:
  - default export first
  - then quantized export (int8) for speed/battery on mobile

WHAT SHOULD NOT GO IN THIS FILE
- Complex dataset download logic (keep outside)
- Confusion matrix plotting (belongs in evaluate.py)

OUTPUTS
- models/ (saved training checkpoints)  [usually gitignored]
- exports/kws_multilingual.tflite       (copy to Flutter assets)

SUCCESS CRITERIA (FIRST MILESTONE)
- Model learns to separate keyword classes vs unknown/noise
- On validation set:
  - good recall on keywords
  - low false positives on unknown/noise

train_kws.py — Train and export the multilingual KWS model.

Run from ML/KWS folder:
  python scripts/train_kws.py
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Dict

import tensorflow as tf

from preprocess import (
    create_splits_and_datasets,
    ensure_dirs_exist,
    get_feature_shape,
)


# -----------------------------
# Training Config
# -----------------------------
DATA_DIR = "data"
SEED = 42
BATCH_SIZE = 32
EPOCHS = 25

TRAIN_RATIO = 0.8
VAL_RATIO = 0.1

LEARNING_RATE = 1e-3

MODELS_DIR = "models"
EXPORTS_DIR = "exports"
MODEL_NAME = "kws_multilingual"

# TFLite export names
TFLITE_FLOAT = f"{MODEL_NAME}_float.tflite"
TFLITE_DRQ = f"{MODEL_NAME}_drq.tflite"  # dynamic range quantization


def compute_class_weights(train_ds: tf.data.Dataset, num_classes: int) -> Dict[int, float]:
    """
    Computes simple inverse-frequency class weights from the training dataset.
    """
    counts = [0] * num_classes
    for _, y in train_ds.unbatch():
        counts[int(y.numpy())] += 1

    total = sum(counts)
    if total == 0:
        return {i: 1.0 for i in range(num_classes)}

    # Inverse frequency weighting (normalized)
    weights = {}
    for i, c in enumerate(counts):
        if c == 0:
            weights[i] = 1.0
        else:
            weights[i] = float(total / (num_classes * c))
    return weights


def build_model(input_shape, num_classes: int) -> tf.keras.Model:
    """
    Small CNN suitable for on-device KWS.
    """
    inputs = tf.keras.layers.Input(shape=input_shape)

    x = tf.keras.layers.Conv2D(16, (3, 3), padding="same", activation="relu")(inputs)
    x = tf.keras.layers.MaxPool2D((2, 2))(x)

    x = tf.keras.layers.Conv2D(32, (3, 3), padding="same", activation="relu")(x)
    x = tf.keras.layers.MaxPool2D((2, 2))(x)

    x = tf.keras.layers.Conv2D(64, (3, 3), padding="same", activation="relu")(x)
    x = tf.keras.layers.GlobalAveragePooling2D()(x)

    x = tf.keras.layers.Dense(64, activation="relu")(x)
    x = tf.keras.layers.Dropout(0.2)(x)

    outputs = tf.keras.layers.Dense(num_classes, activation="softmax")(x)

    return tf.keras.Model(inputs=inputs, outputs=outputs)


def export_tflite(saved_model_dir: str, out_path: str, dynamic_range_quant: bool) -> None:
    """
    Exports a TFLite model.
    - float export: dynamic_range_quant=False
    - dynamic range quant (weights quantized): dynamic_range_quant=True
    """
    converter = tf.lite.TFLiteConverter.from_saved_model(saved_model_dir)
    if dynamic_range_quant:
        converter.optimizations = [tf.lite.Optimize.DEFAULT]
    tflite_model = converter.convert()

    with open(out_path, "wb") as f:
        f.write(tflite_model)


def main():
    ensure_dirs_exist(MODELS_DIR, EXPORTS_DIR)

    train_ds, val_ds, test_ds, class_names = create_splits_and_datasets(
        data_dir=DATA_DIR,
        seed=SEED,
        train_ratio=TRAIN_RATIO,
        val_ratio=VAL_RATIO,
        batch_size=BATCH_SIZE,
    )
    num_classes = len(class_names)
    input_shape = get_feature_shape()

    print("Classes:", class_names)
    print("Input feature shape:", input_shape)

    model = build_model(input_shape, num_classes=num_classes)
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=LEARNING_RATE),
        loss=tf.keras.losses.SparseCategoricalCrossentropy(),
        metrics=["accuracy", tf.keras.metrics.SparseTopKCategoricalAccuracy(k=2, name="top2")],
    )
    model.summary()

    class_weights = compute_class_weights(train_ds, num_classes=num_classes)
    print("Class weights:", class_weights)

    ckpt_path = os.path.join(MODELS_DIR, f"{MODEL_NAME}.keras")
    callbacks = [
        tf.keras.callbacks.ModelCheckpoint(
            ckpt_path,
            monitor="val_accuracy",
            save_best_only=True,
            save_weights_only=False,
            verbose=1,
        ),
        tf.keras.callbacks.EarlyStopping(
            monitor="val_accuracy",
            patience=6,
            restore_best_weights=True,
            verbose=1,
        ),
        tf.keras.callbacks.ReduceLROnPlateau(
            monitor="val_loss",
            factor=0.5,
            patience=3,
            min_lr=1e-5,
            verbose=1,
        ),
    ]

    history = model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=EPOCHS,
        class_weight=class_weights,
        callbacks=callbacks,
        verbose=1,
    )

    # Evaluate on test set
    test_metrics = model.evaluate(test_ds, verbose=1)
    print("Test metrics:", dict(zip(model.metrics_names, test_metrics)))

    # Save as SavedModel for TFLite conversion
    saved_model_dir = os.path.join(MODELS_DIR, f"{MODEL_NAME}_savedmodel")
    model.export(saved_model_dir)  # TF 2.13+; creates a SavedModel

    # Export TFLite models
    float_out = os.path.join(EXPORTS_DIR, TFLITE_FLOAT)
    drq_out = os.path.join(EXPORTS_DIR, TFLITE_DRQ)

    export_tflite(saved_model_dir, float_out, dynamic_range_quant=False)
    export_tflite(saved_model_dir, drq_out, dynamic_range_quant=True)

    # Save labels for Flutter/backend reference
    labels_path = os.path.join(EXPORTS_DIR, f"{MODEL_NAME}_labels.txt")
    with open(labels_path, "w", encoding="utf-8") as f:
        for c in class_names:
            f.write(c + "\n")

    print("\n✅ Export complete:")
    print(" -", float_out)
    print(" -", drq_out)
    print(" -", labels_path)
    print("\nNext: run evaluation with:")
    print("  python scripts/evaluate.py")


if __name__ == "__main__":
    main()

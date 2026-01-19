"""
evaluate.py — Evaluate the trained KWS model (quality + false positives)

WHAT GOES IN THIS FILE
- Load trained model (SavedModel / .h5 / .tflite for final checks)
- Run evaluation on a held-out test set:
  - overall accuracy
  - per-class precision/recall/F1
  - confusion matrix
- Focus on false positives:
  - how often unknown/noise is predicted as a keyword
  - tune thresholds and smoothing rules for real-time usage
- Export results:
  - print to console
  - optionally save metrics to a JSON/text file for reports

WHAT SHOULD NOT GO IN THIS FILE
- Training loops
- Model architecture changes

OUTPUTS
- metrics summary (console + optional file)
- confusion matrix table
- recommended threshold + consecutive-hit rule (for app logic)



Run from ML/KWS folder:
  python scripts/evaluate.py
"""

from __future__ import annotations

import os
import numpy as np
import tensorflow as tf

from preprocess import (
    create_splits_and_datasets,
    ensure_dirs_exist,
    get_feature_shape,
)

DATA_DIR = "data"
SEED = 42
BATCH_SIZE = 32

MODELS_DIR = "models"
EXPORTS_DIR = "exports"
MODEL_NAME = "kws_multilingual"

SAVEDMODEL_DIR = os.path.join(MODELS_DIR, f"{MODEL_NAME}_savedmodel")
TFLITE_PATH = os.path.join(EXPORTS_DIR, f"{MODEL_NAME}_drq.tflite")  # test the quantized one by default


def confusion_and_metrics(y_true: np.ndarray, y_pred: np.ndarray, class_names: list[str]) -> None:
    num_classes = len(class_names)

    cm = tf.math.confusion_matrix(y_true, y_pred, num_classes=num_classes).numpy()
    print("\nConfusion Matrix (rows=true, cols=pred):")
    print(cm)

    print("\nPer-class Precision / Recall / F1:")
    for i, name in enumerate(class_names):
        tp = cm[i, i]
        fp = cm[:, i].sum() - tp
        fn = cm[i, :].sum() - tp

        precision = tp / (tp + fp + 1e-9)
        recall = tp / (tp + fn + 1e-9)
        f1 = 2 * precision * recall / (precision + recall + 1e-9)

        print(f"- {name:14s}  P={precision:.3f}  R={recall:.3f}  F1={f1:.3f}")

    acc = (y_true == y_pred).mean()
    print(f"\nOverall accuracy: {acc:.4f}")

    # False positive focus: how often unknown/noise predicted as keywords
    if "unknown" in class_names and "noise" in class_names:
        unk_i = class_names.index("unknown")
        noi_i = class_names.index("noise")
        keyword_idxs = [i for i, c in enumerate(class_names) if c not in ("unknown", "noise")]

        unk_to_kw = cm[unk_i, keyword_idxs].sum()
        noi_to_kw = cm[noi_i, keyword_idxs].sum()
        unk_total = cm[unk_i, :].sum()
        noi_total = cm[noi_i, :].sum()

        print("\nFalse positive rates (important for safety apps):")
        print(f"- unknown → keyword: {unk_to_kw}/{unk_total} = {unk_to_kw/(unk_total+1e-9):.4f}")
        print(f"- noise   → keyword: {noi_to_kw}/{noi_total} = {noi_to_kw/(noi_total+1e-9):.4f}")


def eval_savedmodel(model: tf.keras.Model, test_ds: tf.data.Dataset, class_names: list[str]) -> None:
    y_true_all = []
    y_pred_all = []

    for x, y in test_ds:
        probs = model.predict(x, verbose=0)
        pred = np.argmax(probs, axis=1)
        y_true_all.append(y.numpy())
        y_pred_all.append(pred)

    y_true = np.concatenate(y_true_all, axis=0)
    y_pred = np.concatenate(y_pred_all, axis=0)

    confusion_and_metrics(y_true, y_pred, class_names)


def eval_tflite(tflite_path: str, test_ds: tf.data.Dataset, class_names: list[str]) -> None:
    if not os.path.exists(tflite_path):
        print(f"\n⚠️ TFLite file not found: {tflite_path}")
        return

    interpreter = tf.lite.Interpreter(model_path=tflite_path)
    interpreter.allocate_tensors()

    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()

    # Expecting input shape [1, T, M, 1]
    in_index = input_details[0]["index"]
    out_index = output_details[0]["index"]

    y_true_all = []
    y_pred_all = []

    for x, y in test_ds.unbatch().batch(1):
        x_np = x.numpy().astype(np.float32)

        interpreter.set_tensor(in_index, x_np)
        interpreter.invoke()
        out = interpreter.get_tensor(out_index)  # [1, num_classes]
        pred = int(np.argmax(out[0]))

        y_true_all.append(int(y.numpy()[0]))
        y_pred_all.append(pred)

    y_true = np.array(y_true_all, dtype=np.int32)
    y_pred = np.array(y_pred_all, dtype=np.int32)

    print(f"\nTFLite evaluation for: {tflite_path}")
    confusion_and_metrics(y_true, y_pred, class_names)


def main():
    ensure_dirs_exist(MODELS_DIR, EXPORTS_DIR)

    train_ds, val_ds, test_ds, class_names = create_splits_and_datasets(
        data_dir=DATA_DIR,
        seed=SEED,
        train_ratio=0.8,
        val_ratio=0.1,
        batch_size=BATCH_SIZE,
    )

    if not os.path.exists(SAVEDMODEL_DIR):
        raise FileNotFoundError(
            f"SavedModel not found at {SAVEDMODEL_DIR}. "
            f"Run: python scripts/train_kws.py"
        )

    # Load SavedModel as Keras model
    model = tf.keras.models.load_model(SAVEDMODEL_DIR)
    print("Loaded SavedModel:", SAVEDMODEL_DIR)
    print("Classes:", class_names)
    print("Feature shape:", get_feature_shape())

    print("\n=== SavedModel Evaluation (reference) ===")
    model.evaluate(test_ds, verbose=1)
    eval_savedmodel(model, test_ds, class_names)

    print("\n=== TFLite Evaluation (deployment sanity check) ===")
    eval_tflite(TFLITE_PATH, test_ds, class_names)

    print("\n✅ Done.")


if __name__ == "__main__":
    main()

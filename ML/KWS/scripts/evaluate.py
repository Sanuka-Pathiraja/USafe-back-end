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
"""

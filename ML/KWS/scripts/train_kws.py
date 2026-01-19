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
"""

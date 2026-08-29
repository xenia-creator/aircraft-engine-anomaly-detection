```
# Aircraft Engine Anomaly Detection

Unsupervised anomaly detection for aircraft engine health monitoring using autoencoders. The system learns normal engine behavior from sensor data and flags deviations that indicate early-stage degradation — without needing any labeled failure data.

## Dataset

NASA C-MAPSS FD001 — 100 turbofan engines, 21 sensors, run-to-failure simulation.

## How It Works

1. 7 constant sensors dropped, 14 useful sensors retained
2. MinMaxScaler normalization (fitted on training data only)
3. First 30% of each engine's lifecycle used as "healthy" training data
4. Autoencoder (14→8→4→8→14) trained to reconstruct healthy sensor readings
5. Reconstruction error used as anomaly score — low error = healthy, high error = degrading
6. Dual threshold alert system:
   - Warning (2.8σ): ~105 cycles early warning, <1 false alarm per engine
   - Critical (3.5σ): ~80 cycles early warning, near-zero false alarms

## Baseline Comparisons

- **Isolation Forest:** ~72 cycles early warning, noisy signal
- **DBSCAN:** unreliable binary flickers, no confidence score
- **Autoencoder** outperforms both in early detection and signal quality

## Validated on Unseen Data

Tested on 100 completely unseen engines (test_FD001.txt). Clear inverse correlation between reconstruction error and actual remaining life — dying engines show high error, healthy engines stay below thresholds.

## Tech Stack

- **ML:** Python, Pandas, NumPy, PyTorch (Autoencoder), Scikit-learn (Isolation Forest, DBSCAN, MinMaxScaler)
- **Backend:** Flask
- **Frontend:** HTML, CSS, vanilla JS, Chart.js

## Project Structure

```
├── data/               # NASA C-MAPSS FD001 dataset
├── models/             # saved model weights and scalers
├── notebooks/          # EDA and model development
├── templates/          # HTML pages
├── static/             # CSS, JS, images
│   ├── css/
│   ├── js/
│   └── images/
├── app.py              # Flask server
├── requirements.txt
└── README.md
```

## Dashboard

1. **Engine Dashboard** — select engine, view reconstruction error timeline with warning/critical zones, engine health status
2. **Fleet Overview** — scatter plot of error vs remaining life across all test engines, fleet health summary
3. **Model Comparison** — side by side Autoencoder vs Isolation Forest vs DBSCAN for selected engine

## Setup

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py
```
```
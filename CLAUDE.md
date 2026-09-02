# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running

```
pip install -r requirements.txt
python app.py          # http://127.0.0.1:5051
```

Run from the repo root. `app.py` loads `models/*` and `data/*` via relative paths at import time, so starting it from anywhere else raises `FileNotFoundError` before Flask boots. The port is 5051, not Flask's default 5000.

## Model artifact contracts

`app.py` re-declares the `AutoEncoder` class rather than importing it, so several values are duplicated between `notebooks/understanding.ipynb` and `app.py` and must be changed in both places:

- **Architecture** `14→8→4→8→14` (ReLU encoder, Sigmoid output). `torch.load` of `models/autoencoder_model.pth` is a `state_dict` load and fails loudly on any layer-shape change.
- **`keep_sensors`** — the 14 retained sensors (`s2, s3, s4, s7, s8, s9, s11, s12, s13, s14, s15, s17, s20, s21`). This exact list and order define the scaler's feature space; `models/scaler.pkl` was fitted on it and will silently produce wrong reconstruction errors if the order changes.
- **Thresholds** come from `models/thresholds.pkl` (`warning` = healthy mean + 2.8σ, `critical` = + 3.5σ, computed on the first 30% of each training engine's lifecycle). Never hardcode them in `app.py` or the frontend — every API response passes them through to the charts.

Regenerate artifacts by re-running the notebook cells that export them; `notebooks/` is the source of truth for training and threshold selection. Don't duplicate training logic into `.py` scripts.

## Gotchas

- `data/RUL_FD001.txt` has no unit_id column — RUL is looked up positionally as `rul.iloc[unit_id - 1]`, and this is only valid for the test set. Train engines have no RUL.
- `/api/comparison` re-fits DBSCAN on every request instead of loading `models/dbscan.pkl`. This is intentional (labels are per-engine), but it makes that route the slow one.
- `/api/fleet_overview` runs the autoencoder over all 100 test engines per request, with no caching.
- The dataframes are scaled once at import and held in module globals. Anything that mutates `train_df`/`test_df` in a route corrupts every later request.

## LSTM autoencoder — work in progress

`models/lstm_*` and `notebooks/lstm_autoencoder.ipynb` are trained but not yet served: `app.py` never loads them. Wiring the LSTM into the dashboard is intended work — see the `/add-model` skill. It uses 30-cycle sliding windows, so its error series is shorter than the cycle axis; each window's error maps to its **last** cycle, and engines under 30 cycles produce no windows at all.

## Frontend conventions

Chart.js only, no build step. Shared dark-theme defaults, the `CHART_COLORS` palette, `thresholdZonePlugin`, and `thresholdLineDatasets` live in `static/js/charts-common.js` — reuse them rather than restyling per page. Each page's script is an IIFE that fetches its own `/api/*` endpoint and destroys the previous `Chart` instance before re-rendering.

## Git

Branch off `main` and open a PR; don't commit straight to `main`.

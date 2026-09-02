import pickle
import pandas as pd
import numpy as np
import torch
import torch.nn as nn
from flask import Flask, render_template, jsonify, request

app = Flask(__name__)

# ---- model class (same as notebook) ----
class AutoEncoder(nn.Module):
    def __init__(self):
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Linear(14, 8),
            nn.ReLU(),
            nn.Linear(8, 4),
            nn.ReLU()
        )
        self.decoder = nn.Sequential(
            nn.Linear(4, 8),
            nn.ReLU(),
            nn.Linear(8, 14),
            nn.Sigmoid()
        )
    def forward(self, x):
        encoded = self.encoder(x)
        decoded = self.decoder(encoded)
        return decoded

# ---- LSTM model class (same as notebooks/lstm_autoencoder.ipynb) ----
class LSTMAutoEncoder(nn.Module):
    def __init__(self, n_sensors=14, hidden_size=32, n_layers=1):
        super().__init__()
        self.n_sensors = n_sensors
        self.hidden_size = hidden_size
        self.n_layers = n_layers

        # encoder: reads the 30-cycle sequence and compresses it into a hidden state
        self.encoder = nn.LSTM(
            input_size=n_sensors,
            hidden_size=hidden_size,
            num_layers=n_layers,
            batch_first=True
        )

        # decoder: takes the hidden state and tries to reconstruct the full sequence
        self.decoder = nn.LSTM(
            input_size=n_sensors,
            hidden_size=hidden_size,
            num_layers=n_layers,
            batch_first=True
        )

        # converts LSTM output back to 14 sensor values
        self.output_layer = nn.Sequential(
            nn.Linear(hidden_size, n_sensors),
            nn.Sigmoid()
        )

    def forward(self, x):
        # ENCODE - process full sequence, keep only final hidden state
        _, (hidden, cell) = self.encoder(x)
        # DECODE - use final hidden state to reconstruct the sequence
        decoder_output, _ = self.decoder(x, (hidden, cell))
        return self.output_layer(decoder_output)


# ---- load models ----
model = AutoEncoder()
model.load_state_dict(torch.load('models/autoencoder_model.pth', map_location='cpu'))
model.eval()

scaler = pickle.load(open('models/scaler.pkl', 'rb'))
thresholds = pickle.load(open('models/thresholds.pkl', 'rb'))
iso_forest = pickle.load(open('models/isolation_forest.pkl', 'rb'))

warning = float(thresholds['warning'])
critical = float(thresholds['critical'])

# ---- load LSTM models ----
# window size and sensor list come from the config rather than being redeclared,
# since they define the feature space lstm_scaler.pkl was fitted on
lstm_config = pickle.load(open('models/lstm_config.pkl', 'rb'))
LSTM_WINDOW = int(lstm_config['window_size'])
lstm_keep_sensors = list(lstm_config['keep_sensors'])

lstm_model = LSTMAutoEncoder(n_sensors=len(lstm_keep_sensors))
lstm_model.load_state_dict(torch.load('models/lstm_autoencoder_model.pth', map_location='cpu'))
lstm_model.eval()

lstm_scaler = pickle.load(open('models/lstm_scaler.pkl', 'rb'))
lstm_thresholds = pickle.load(open('models/lstm_thresholds.pkl', 'rb'))

lstm_warning = float(lstm_thresholds['warning'])
lstm_critical = float(lstm_thresholds['critical'])

# ---- load data ----
columns = ['unit_id', 'cycle', 'op1', 'op2', 'op3',
           's1', 's2', 's3', 's4', 's5', 's6', 's7',
           's8', 's9', 's10', 's11', 's12', 's13', 's14',
           's15', 's16', 's17', 's18', 's19', 's20', 's21']

keep_sensors = ['s2', 's3', 's4', 's7', 's8', 's9', 's11', 's12',
                's13', 's14', 's15', 's17', 's20', 's21']

train_df = pd.read_csv('data/train_FD001.txt', sep='\s+', header=None, names=columns)
train_df = train_df[['unit_id', 'cycle'] + keep_sensors]
train_df[keep_sensors] = scaler.transform(train_df[keep_sensors])

test_df = pd.read_csv('data/test_FD001.txt', sep='\s+', header=None, names=columns)
test_df = test_df[['unit_id', 'cycle'] + keep_sensors]
test_df[keep_sensors] = scaler.transform(test_df[keep_sensors])

rul = pd.read_csv('data/RUL_FD001.txt', header=None, names=['rul'])

# the LSTM was fitted with its own MinMaxScaler, so it needs its own scaled copies -
# reusing train_df/test_df would feed it data scaled for the dense autoencoder
lstm_train_df = pd.read_csv('data/train_FD001.txt', sep='\s+', header=None, names=columns)
lstm_train_df = lstm_train_df[['unit_id', 'cycle'] + lstm_keep_sensors]
lstm_train_df[lstm_keep_sensors] = lstm_scaler.transform(lstm_train_df[lstm_keep_sensors])

lstm_test_df = pd.read_csv('data/test_FD001.txt', sep='\s+', header=None, names=columns)
lstm_test_df = lstm_test_df[['unit_id', 'cycle'] + lstm_keep_sensors]
lstm_test_df[lstm_keep_sensors] = lstm_scaler.transform(lstm_test_df[lstm_keep_sensors])


# ---- helper: get reconstruction errors for an engine ----
def get_autoencoder_errors(df, unit_id):
    engine = df[df['unit_id'] == unit_id]
    sensors = torch.FloatTensor(engine[keep_sensors].values)
    with torch.no_grad():
        recon = model(sensors)
        errors = torch.mean((sensors - recon) ** 2, dim=1).numpy()
    return engine['cycle'].values.tolist(), errors.tolist()


def get_isolation_forest_scores(df, unit_id):
    engine = df[df['unit_id'] == unit_id]
    scores = iso_forest.decision_function(engine[keep_sensors])
    return engine['cycle'].values.tolist(), scores.tolist()


def get_engine_status(error):
    if error >= critical:
        return 'CRITICAL'
    elif error >= warning:
        return 'WARNING'
    return 'HEALTHY'


def create_windows(data, window_size):
    windows = []
    for i in range(len(data) - window_size + 1):
        windows.append(data[i:i + window_size])
    return np.array(windows)


def get_lstm_errors(df, unit_id):
    """Per-window reconstruction error for one engine.

    Each window's error maps to its LAST cycle, so the series starts at cycle
    LSTM_WINDOW and is shorter than the engine's cycle axis. Engines with fewer
    than LSTM_WINDOW cycles produce no windows at all.
    """
    engine = df[df['unit_id'] == unit_id]
    sensors = engine[lstm_keep_sensors].values

    if len(sensors) < LSTM_WINDOW:
        return [], []

    windows = torch.FloatTensor(create_windows(sensors, LSTM_WINDOW))
    with torch.no_grad():
        recon = lstm_model(windows)
        errors = torch.mean((windows - recon) ** 2, dim=(1, 2)).numpy()

    cycles = engine['cycle'].values[LSTM_WINDOW - 1:]
    return cycles.tolist(), errors.tolist()


def get_lstm_status(error):
    if error >= lstm_critical:
        return 'CRITICAL'
    elif error >= lstm_warning:
        return 'WARNING'
    return 'HEALTHY'


# ---- page routes ----
@app.route('/')
def dashboard():
    return render_template('dashboard.html')

@app.route('/fleet')
def fleet():
    return render_template('fleet.html')

@app.route('/lstm')
def lstm():
    return render_template('lstm.html')


@app.route('/lstm-fleet')
def lstm_fleet():
    return render_template('lstm-fleet.html')


@app.route('/comparison')
def comparison():
    return render_template('comparison.html')


# ---- API routes ----
@app.route('/api/engine_list')
def engine_list():
    train_ids = sorted(train_df['unit_id'].unique().tolist())
    test_ids = sorted(test_df['unit_id'].unique().tolist())
    return jsonify({'train': train_ids, 'test': test_ids})


@app.route('/api/engine_data')
def engine_data():
    unit_id = int(request.args.get('unit_id'))
    dataset = request.args.get('dataset', 'train')

    df = train_df if dataset == 'train' else test_df
    cycles, errors = get_autoencoder_errors(df, unit_id)

    max_error = max(errors)
    status = get_engine_status(max_error)
    latest_error = errors[-1]

    # first warning and critical cycle
    first_warning = None
    first_critical = None
    for i, e in enumerate(errors):
        if first_warning is None and e > warning:
            first_warning = cycles[i]
        if first_critical is None and e > critical:
            first_critical = cycles[i]

    result = {
        'cycles': cycles,
        'errors': errors,
        'warning': warning,
        'critical': critical,
        'status': get_engine_status(latest_error),
        'latest_error': round(latest_error, 6),
        'total_cycles': len(cycles),
        'first_warning': first_warning,
        'first_critical': first_critical
    }

    # add RUL if test engine
    if dataset == 'test':
        result['rul'] = int(rul.iloc[unit_id - 1]['rul'])

    return jsonify(result)


@app.route('/api/fleet_overview')
def fleet_overview():
    results = []
    for uid in test_df['unit_id'].unique():
        cycles, errors = get_autoencoder_errors(test_df, uid)
        latest_error = errors[-1]
        remaining_life = int(rul.iloc[uid - 1]['rul'])
        results.append({
            'unit_id': int(uid),
            'latest_error': round(latest_error, 6),
            'rul': remaining_life,
            'status': get_engine_status(latest_error),
            'total_cycles': len(cycles)
        })
    return jsonify({
        'engines': results,
        'warning': warning,
        'critical': critical
    })


@app.route('/api/comparison')
def comparison_data():
    unit_id = int(request.args.get('unit_id'))
    dataset = request.args.get('dataset', 'train')

    df = train_df if dataset == 'train' else test_df

    ae_cycles, ae_errors = get_autoencoder_errors(df, unit_id)
    if_cycles, if_scores = get_isolation_forest_scores(df, unit_id)

    # the LSTM reads from its own scaled frames and has its own thresholds
    lstm_df = lstm_train_df if dataset == 'train' else lstm_test_df
    lstm_cycles, lstm_errors = get_lstm_errors(lstm_df, unit_id)

    # dbscan
    engine = df[df['unit_id'] == unit_id]
    from sklearn.cluster import DBSCAN
    dbscan_model = DBSCAN(eps=0.3, min_samples=10)
    labels = dbscan_model.fit_predict(engine[keep_sensors])

    return jsonify({
        'autoencoder': {'cycles': ae_cycles, 'errors': ae_errors},
        'isolation_forest': {'cycles': if_cycles, 'scores': if_scores},
        'dbscan': {'cycles': ae_cycles, 'labels': labels.tolist()},
        # the LSTM carries its own thresholds inside its block — they are on a
        # different scale to the dense autoencoder's and must not be mixed up
        'lstm': {
            'cycles': lstm_cycles,
            'errors': lstm_errors,
            'warning': lstm_warning,
            'critical': lstm_critical,
            'window_size': LSTM_WINDOW
        },
        'warning': warning,
        'critical': critical
    })


@app.route('/api/lstm_fleet_overview')
def lstm_fleet_overview():
    results = []
    skipped = []
    for uid in lstm_test_df['unit_id'].unique():
        cycles, errors = get_lstm_errors(lstm_test_df, uid)

        # engines shorter than one window produce no score at all
        if not errors:
            skipped.append(int(uid))
            continue

        latest_error = errors[-1]
        remaining_life = int(rul.iloc[uid - 1]['rul'])
        results.append({
            'unit_id': int(uid),
            'latest_error': round(latest_error, 6),
            'rul': remaining_life,
            'status': get_lstm_status(latest_error),
            'total_cycles': int((lstm_test_df['unit_id'] == uid).sum()),
            'total_windows': len(errors)
        })
    return jsonify({
        'engines': results,
        'warning': lstm_warning,
        'critical': lstm_critical,
        'window_size': LSTM_WINDOW,
        'skipped': skipped
    })


@app.route('/api/lstm_engine_data')
def lstm_engine_data():
    unit_id = int(request.args.get('unit_id'))
    dataset = request.args.get('dataset', 'train')

    df = lstm_train_df if dataset == 'train' else lstm_test_df
    total_cycles = int((df['unit_id'] == unit_id).sum())
    cycles, errors = get_lstm_errors(df, unit_id)

    result = {
        'cycles': cycles,
        'errors': errors,
        'warning': lstm_warning,
        'critical': lstm_critical,
        'window_size': LSTM_WINDOW,
        'total_cycles': total_cycles,
        'total_windows': len(errors)
    }

    if errors:
        latest_error = errors[-1]

        # first warning and critical cycle
        first_warning = None
        first_critical = None
        for i, e in enumerate(errors):
            if first_warning is None and e > lstm_warning:
                first_warning = cycles[i]
            if first_critical is None and e > lstm_critical:
                first_critical = cycles[i]

        result.update({
            'status': get_lstm_status(latest_error),
            'latest_error': round(latest_error, 6),
            'first_warning': first_warning,
            'first_critical': first_critical
        })
    else:
        # engine shorter than one window - nothing to score
        result.update({
            'status': None,
            'latest_error': None,
            'first_warning': None,
            'first_critical': None
        })

    # add RUL if test engine
    if dataset == 'test':
        result['rul'] = int(rul.iloc[unit_id - 1]['rul'])

    return jsonify(result)


if __name__ == '__main__':
    app.run(debug=True, port=5051)
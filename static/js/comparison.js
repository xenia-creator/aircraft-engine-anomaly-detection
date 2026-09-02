(function () {
  const datasetSelect = document.getElementById('dataset-select');
  const engineSelect = document.getElementById('engine-select');

  let aeChart = null;
  let ifChart = null;
  let dbChart = null;
  let lstmChart = null;

  async function loadEngineList() {
    const res = await fetch('/api/engine_list');
    return res.json();
  }

  function populateEngineOptions(ids) {
    engineSelect.innerHTML = ids.map((id) => `<option value="${id}">Engine #${id}</option>`).join('');
  }

  function baseLineOptions(xLabel, yLabel) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f1523',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          titleColor: '#f1f5f9',
          bodyColor: '#8b96ab',
          padding: 10
        }
      },
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: xLabel, color: CHART_COLORS.text },
          grid: baseGridOptions,
          ticks: { color: CHART_COLORS.text }
        },
        y: {
          title: { display: true, text: yLabel, color: CHART_COLORS.text },
          grid: baseGridOptions,
          ticks: { color: CHART_COLORS.text }
        }
      }
    };
  }

  function renderAutoencoderChart(ae, warning, critical) {
    const ctx = document.getElementById('chart-autoencoder').getContext('2d');
    const points = ae.cycles.map((c, i) => ({ x: c, y: ae.errors[i] }));
    const maxY = Math.max(critical * 1.3, ...ae.errors) * 1.05;

    if (aeChart) aeChart.destroy();
    aeChart = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'Reconstruction error',
            data: points,
            borderColor: CHART_COLORS.accent,
            backgroundColor: (context) => {
              const { ctx, chartArea } = context.chart;
              if (!chartArea) return 'rgba(56,189,248,0.15)';
              return verticalGradient(ctx, chartArea, 'rgba(56,189,248,0.35)', 'rgba(56,189,248,0.02)');
            },
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            fill: true,
            tension: 0.25
          },
          ...thresholdLineDatasets(ae.cycles, warning, critical)
        ]
      },
      options: {
        ...baseLineOptions('Cycle', 'MSE'),
        scales: {
          ...baseLineOptions('Cycle', 'MSE').scales,
          y: { ...baseLineOptions('Cycle', 'MSE').scales.y, min: 0, max: maxY }
        }
      },
      plugins: [thresholdZonePlugin(warning, critical, maxY)]
    });
  }

  function renderIsolationChart(iso) {
    const ctx = document.getElementById('chart-isolation').getContext('2d');
    const points = iso.cycles.map((c, i) => ({ x: c, y: iso.scores[i] }));
    const zeroLine = iso.cycles.map((x) => ({ x, y: 0 }));

    if (ifChart) ifChart.destroy();
    ifChart = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'Anomaly score',
            data: points,
            borderColor: CHART_COLORS.violet,
            backgroundColor: 'rgba(167,139,250,0.12)',
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            fill: true,
            tension: 0.25
          },
          {
            label: 'Zero reference',
            data: zeroLine,
            borderColor: 'rgba(255,255,255,0.25)',
            borderDash: [6, 5],
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false
          }
        ]
      },
      options: baseLineOptions('Cycle', 'Decision function score')
    });
  }

  function renderDbscanChart(db) {
    const ctx = document.getElementById('chart-dbscan').getContext('2d');
    const points = db.cycles.map((c, i) => ({ x: c, y: db.labels[i] }));
    const colors = db.labels.map((l) => (l === -1 ? CHART_COLORS.red : CHART_COLORS.green));

    if (dbChart) dbChart.destroy();
    dbChart = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: 'Cluster label',
            data: points,
            backgroundColor: colors,
            pointRadius: 3,
            pointHoverRadius: 5,
            showLine: true,
            borderColor: 'rgba(255,255,255,0.15)',
            borderWidth: 1,
            stepped: true
          }
        ]
      },
      options: {
        ...baseLineOptions('Cycle', 'Cluster label'),
        plugins: {
          ...baseLineOptions('Cycle', 'Cluster label').plugins,
          tooltip: {
            ...baseLineOptions('Cycle', 'Cluster label').plugins.tooltip,
            callbacks: {
              label: (item) => `Cycle ${item.raw.x}: ${item.raw.y === -1 ? 'Anomaly (-1)' : `Cluster ${item.raw.y}`}`
            }
          }
        }
      }
    });
  }

  // The LSTM scores 30-cycle windows rather than single cycles, so its series is
  // shorter than the other three and carries its own thresholds.
  function renderLstmChart(lstm) {
    const emptyEl = document.getElementById('lstm-empty');
    const wrapEl = document.getElementById('chart-lstm').parentElement;

    if (lstmChart) {
      lstmChart.destroy();
      lstmChart = null;
    }

    if (!lstm || !lstm.errors.length) {
      wrapEl.style.display = 'none';
      emptyEl.style.display = 'block';
      return;
    }
    wrapEl.style.display = '';
    emptyEl.style.display = 'none';

    const ctx = document.getElementById('chart-lstm').getContext('2d');
    const points = lstm.cycles.map((c, i) => ({ x: c, y: lstm.errors[i] }));
    const maxY = Math.max(lstm.critical * 1.3, ...lstm.errors) * 1.05;
    const opts = baseLineOptions('Cycle (window end)', 'Sequence MSE');

    lstmChart = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'Window reconstruction error',
            data: points,
            borderColor: CHART_COLORS.accentStrong,
            backgroundColor: (context) => {
              const { ctx, chartArea } = context.chart;
              if (!chartArea) return 'rgba(34,211,238,0.15)';
              return verticalGradient(ctx, chartArea, 'rgba(34,211,238,0.35)', 'rgba(34,211,238,0.02)');
            },
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            fill: true,
            tension: 0.25
          },
          ...thresholdLineDatasets(lstm.cycles, lstm.warning, lstm.critical)
        ]
      },
      options: {
        ...opts,
        scales: {
          ...opts.scales,
          y: { ...opts.scales.y, min: 0, max: maxY }
        }
      },
      plugins: [thresholdZonePlugin(lstm.warning, lstm.critical, maxY)]
    });
  }

  async function loadComparison() {
    const unitId = engineSelect.value;
    const dataset = datasetSelect.value;
    if (!unitId) return;

    const res = await fetch(`/api/comparison?unit_id=${unitId}&dataset=${dataset}`);
    const data = await res.json();

    renderAutoencoderChart(data.autoencoder, data.warning, data.critical);
    renderIsolationChart(data.isolation_forest);
    renderDbscanChart(data.dbscan);
    renderLstmChart(data.lstm);
  }

  async function init() {
    const list = await loadEngineList();
    const ids = datasetSelect.value === 'train' ? list.train : list.test;
    populateEngineOptions(ids);
    await loadComparison();

    datasetSelect.addEventListener('change', async () => {
      const list = await loadEngineList();
      const ids = datasetSelect.value === 'train' ? list.train : list.test;
      populateEngineOptions(ids);
      await loadComparison();
    });

    engineSelect.addEventListener('change', loadComparison);
  }

  init();
})();

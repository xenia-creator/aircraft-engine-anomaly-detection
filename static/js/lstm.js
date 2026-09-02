(function () {
  const datasetSelect = document.getElementById('dataset-select');
  const engineSelect = document.getElementById('engine-select');
  const rulBadge = document.getElementById('rul-badge');
  const rulValue = document.getElementById('rul-value');
  const emptyState = document.getElementById('empty-state');
  const chartWrap = document.querySelector('.chart-wrap');

  let chart = null;

  async function loadEngineList() {
    const res = await fetch('/api/engine_list');
    const data = await res.json();
    return data;
  }

  function populateEngineOptions(ids) {
    engineSelect.innerHTML = ids.map((id) => `<option value="${id}">Engine #${id}</option>`).join('');
  }

  function renderStats(d) {
    // an engine shorter than one window has no scored points at all
    const scored = d.total_windows > 0;

    document.getElementById('stat-latest-error').textContent = scored ? fmtNum(d.latest_error, 6) : '—';

    const errorNote = document.getElementById('stat-error-note');
    if (scored) {
      errorNote.textContent = d.latest_error >= d.warning
        ? `${(d.latest_error / d.warning).toFixed(1)}× warning threshold`
        : 'Below warning threshold';
      errorNote.className = 'stat-note ' + (d.status === 'CRITICAL' ? 'red' : d.status === 'WARNING' ? 'amber' : 'green');
    } else {
      errorNote.textContent = 'Not enough cycles';
      errorNote.className = 'stat-note muted';
    }

    document.getElementById('stat-status-badge').innerHTML = scored
      ? statusBadgeHtml(d.status)
      : '<span class="badge badge-healthy">—</span>';
    document.getElementById('stat-status-note').textContent = scored
      ? `Latest of ${d.total_windows} windows`
      : `Needs ${d.window_size} cycles minimum`;

    document.getElementById('stat-total-cycles').innerHTML = `${d.total_cycles}<span class="unit">cycles</span>`;
    // the error series is shorter than the cycle axis: one point per sliding window
    document.getElementById('stat-cycles-note').textContent =
      `${d.total_windows} windows of ${d.window_size} cycles`;

    document.getElementById('stat-first-warning').textContent =
      d.first_warning !== null && d.first_warning !== undefined ? d.first_warning : '—';
    document.getElementById('stat-warning-note').textContent =
      `First critical cycle: ${d.first_critical !== null && d.first_critical !== undefined ? d.first_critical : '—'}`;

    if (d.rul !== undefined) {
      rulBadge.style.display = 'inline-flex';
      rulValue.textContent = d.rul;
    } else {
      rulBadge.style.display = 'none';
    }
  }

  function renderChart(d) {
    if (chart) {
      chart.destroy();
      chart = null;
    }

    if (!d.total_windows) {
      chartWrap.style.display = 'none';
      emptyState.style.display = 'block';
      return;
    }
    chartWrap.style.display = '';
    emptyState.style.display = 'none';

    const ctx = document.getElementById('error-chart').getContext('2d');
    const maxY = Math.max(d.critical * 1.3, ...d.errors) * 1.05;

    // x is the window's LAST cycle, so the series starts at cycle window_size
    const errorPoints = d.cycles.map((c, i) => ({ x: c, y: d.errors[i] }));

    chart = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'Window reconstruction error',
            data: errorPoints,
            borderColor: CHART_COLORS.violet,
            backgroundColor: (context) => {
              const { ctx, chartArea } = context.chart;
              if (!chartArea) return 'rgba(167,139,250,0.15)';
              return verticalGradient(ctx, chartArea, 'rgba(167,139,250,0.35)', 'rgba(167,139,250,0.02)');
            },
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            fill: true,
            tension: 0.25,
            order: 1
          },
          ...thresholdLineDatasets(d.cycles, d.warning, d.critical)
        ]
      },
      options: {
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
            padding: 10,
            callbacks: {
              title: (items) => `Cycle ${items[0].parsed.x}`
            }
          }
        },
        scales: {
          x: {
            type: 'linear',
            title: { display: true, text: 'Cycle (window end)', color: CHART_COLORS.text },
            grid: baseGridOptions,
            ticks: { color: CHART_COLORS.text }
          },
          y: {
            min: 0,
            max: maxY,
            title: { display: true, text: 'Sequence reconstruction MSE', color: CHART_COLORS.text },
            grid: baseGridOptions,
            ticks: { color: CHART_COLORS.text }
          }
        }
      },
      plugins: [thresholdZonePlugin(d.warning, d.critical, maxY)]
    });
  }

  async function loadEngineData() {
    const unitId = engineSelect.value;
    const dataset = datasetSelect.value;
    if (!unitId) return;

    const res = await fetch(`/api/lstm_engine_data?unit_id=${unitId}&dataset=${dataset}`);
    const data = await res.json();
    renderStats(data);
    renderChart(data);
  }

  async function init() {
    const list = await loadEngineList();
    const ids = datasetSelect.value === 'train' ? list.train : list.test;
    populateEngineOptions(ids);
    await loadEngineData();

    datasetSelect.addEventListener('change', async () => {
      const list = await loadEngineList();
      const ids = datasetSelect.value === 'train' ? list.train : list.test;
      populateEngineOptions(ids);
      await loadEngineData();
    });

    engineSelect.addEventListener('change', loadEngineData);
  }

  init();
})();

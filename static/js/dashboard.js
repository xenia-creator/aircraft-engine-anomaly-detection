(function () {
  const datasetSelect = document.getElementById('dataset-select');
  const engineSelect = document.getElementById('engine-select');
  const rulBadge = document.getElementById('rul-badge');
  const rulValue = document.getElementById('rul-value');

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
    document.getElementById('stat-latest-error').textContent = fmtNum(d.latest_error, 6);

    const overWarning = d.latest_error >= d.warning;
    document.getElementById('stat-error-note').textContent = overWarning
      ? `${(d.latest_error / d.warning).toFixed(1)}× warning threshold`
      : 'Below warning threshold';
    document.getElementById('stat-error-note').className = 'stat-note ' + (d.status === 'CRITICAL' ? 'red' : d.status === 'WARNING' ? 'amber' : 'green');

    document.getElementById('stat-status-badge').innerHTML = statusBadgeHtml(d.status);
    document.getElementById('stat-status-note').textContent = `Cycle ${d.total_cycles} of recorded life`;

    document.getElementById('stat-total-cycles').innerHTML = `${d.total_cycles}<span class="unit">cycles</span>`;

    document.getElementById('stat-first-warning').textContent = d.first_warning !== null ? d.first_warning : '—';
    document.getElementById('stat-warning-note').textContent = `First critical cycle: ${d.first_critical !== null ? d.first_critical : '—'}`;

    if (d.rul !== undefined) {
      rulBadge.style.display = 'inline-flex';
      rulValue.textContent = d.rul;
    } else {
      rulBadge.style.display = 'none';
    }
  }

  function renderChart(d) {
    const ctx = document.getElementById('error-chart').getContext('2d');
    const maxY = Math.max(d.critical * 1.3, ...d.errors) * 1.05;

    const errorPoints = d.cycles.map((c, i) => ({ x: c, y: d.errors[i] }));

    if (chart) chart.destroy();

    chart = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'Reconstruction error',
            data: errorPoints,
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
            padding: 10
          }
        },
        scales: {
          x: {
            type: 'linear',
            title: { display: true, text: 'Cycle', color: CHART_COLORS.text },
            grid: baseGridOptions,
            ticks: { color: CHART_COLORS.text }
          },
          y: {
            min: 0,
            max: maxY,
            title: { display: true, text: 'Reconstruction MSE', color: CHART_COLORS.text },
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

    const res = await fetch(`/api/engine_data?unit_id=${unitId}&dataset=${dataset}`);
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

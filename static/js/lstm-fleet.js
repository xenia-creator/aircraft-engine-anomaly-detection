// LSTM fleet overview - same layout and interactions as fleet.js, but scored with
// the LSTM autoencoder: each engine's value is its LAST 30-cycle window error,
// compared against the LSTM's own warning/critical thresholds.
(function () {
  let currentSort = { key: 'unit_id', dir: 'asc' };
  let engines = [];
  let warning = 0;
  let critical = 0;

  const statusColor = (status) => (status === 'CRITICAL' ? CHART_COLORS.red : status === 'WARNING' ? CHART_COLORS.amber : CHART_COLORS.green);

  function renderCounts() {
    const counts = { HEALTHY: 0, WARNING: 0, CRITICAL: 0 };
    engines.forEach((e) => counts[e.status]++);
    document.getElementById('count-healthy').textContent = counts.HEALTHY;
    document.getElementById('count-warning').textContent = counts.WARNING;
    document.getElementById('count-critical').textContent = counts.CRITICAL;
  }

  function renderScatter() {
    const ctx = document.getElementById('fleet-scatter').getContext('2d');

    const byStatus = { HEALTHY: [], WARNING: [], CRITICAL: [] };
    let maxRul = 0;
    let maxError = critical;
    engines.forEach((e) => {
      byStatus[e.status].push({ x: e.rul, y: e.latest_error, unit_id: e.unit_id });
      if (e.rul > maxRul) maxRul = e.rul;
      if (e.latest_error > maxError) maxError = e.latest_error;
    });
    const yMax = maxError * 1.08;
    const xTicks = [0, maxRul];

    new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: 'Healthy',
            data: byStatus.HEALTHY,
            backgroundColor: CHART_COLORS.green,
            pointRadius: 4,
            pointHoverRadius: 6
          },
          {
            label: 'Warning',
            data: byStatus.WARNING,
            backgroundColor: CHART_COLORS.amber,
            pointRadius: 4,
            pointHoverRadius: 6
          },
          {
            label: 'Critical',
            data: byStatus.CRITICAL,
            backgroundColor: CHART_COLORS.red,
            pointRadius: 4,
            pointHoverRadius: 6
          },
          ...thresholdLineDatasets(xTicks, warning, critical)
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
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
              label: (item) => {
                if (item.raw.unit_id === undefined) return item.dataset.label;
                return `Engine #${item.raw.unit_id} · window error ${item.raw.y.toFixed(5)} · RUL ${item.raw.x}`;
              }
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: 'Remaining Useful Life (cycles)', color: CHART_COLORS.text },
            reverse: true,
            grid: baseGridOptions,
            ticks: { color: CHART_COLORS.text }
          },
          y: {
            min: 0,
            max: yMax,
            title: { display: true, text: 'Latest Window Error', color: CHART_COLORS.text },
            grid: baseGridOptions,
            ticks: { color: CHART_COLORS.text }
          }
        }
      },
      plugins: [thresholdZonePlugin(warning, critical, yMax)]
    });
  }

  function sortEngines() {
    const { key, dir } = currentSort;
    const mult = dir === 'asc' ? 1 : -1;
    engines.sort((a, b) => {
      if (typeof a[key] === 'string') return a[key].localeCompare(b[key]) * mult;
      return (a[key] - b[key]) * mult;
    });
  }

  function renderTable() {
    sortEngines();
    const body = document.getElementById('fleet-table-body');
    body.innerHTML = engines.map((e) => `
      <tr>
        <td class="mono">#${e.unit_id}</td>
        <td class="mono">${e.latest_error.toFixed(6)}</td>
        <td class="mono">${e.rul}</td>
        <td>${statusBadgeHtml(e.status)}</td>
        <td class="mono">${e.total_cycles}</td>
      </tr>
    `).join('');

    document.querySelectorAll('#fleet-table thead th').forEach((th) => {
      th.classList.toggle('sorted', th.dataset.key === currentSort.key);
      const arrow = th.querySelector('.sort-arrow');
      if (th.dataset.key === currentSort.key) {
        arrow.textContent = currentSort.dir === 'asc' ? '↑' : '↓';
      } else {
        arrow.textContent = '↕';
      }
    });
  }

  function bindSorting() {
    document.querySelectorAll('#fleet-table thead th').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.dataset.key;
        if (currentSort.key === key) {
          currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
        } else {
          currentSort = { key, dir: 'asc' };
        }
        renderTable();
      });
    });
  }

  async function init() {
    const res = await fetch('/api/lstm_fleet_overview');
    const data = await res.json();
    engines = data.engines;
    warning = data.warning;
    critical = data.critical;

    renderCounts();
    renderScatter();
    bindSorting();
    renderTable();
  }

  init();
})();

// Shared Chart.js helpers: dark theme defaults, threshold-zone background plugin,
// and small formatting utilities reused across dashboard/fleet/comparison pages.

Chart.defaults.color = '#8b96ab';
Chart.defaults.font.family = "Inter, -apple-system, 'Segoe UI', sans-serif";
Chart.defaults.font.size = 12;

const CHART_COLORS = {
  accent: '#38bdf8',
  accentStrong: '#22d3ee',
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
  violet: '#a78bfa',
  grid: 'rgba(255, 255, 255, 0.06)',
  text: '#8b96ab'
};

function fmtNum(n, digits = 4) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return Number(n).toFixed(digits);
}

function statusBadgeHtml(status) {
  const cls = status === 'CRITICAL' ? 'badge-critical' : status === 'WARNING' ? 'badge-warning' : 'badge-healthy';
  const label = status === 'CRITICAL' ? 'Critical' : status === 'WARNING' ? 'Warning' : 'Healthy';
  return `<span class="badge ${cls}"><span class="dot dot-${status === 'CRITICAL' ? 'red' : status === 'WARNING' ? 'amber' : 'green'}"></span>${label}</span>`;
}

function verticalGradient(ctx, chartArea, colorTop, colorBottom) {
  const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
  gradient.addColorStop(0, colorTop);
  gradient.addColorStop(1, colorBottom);
  return gradient;
}

// Draws horizontal healthy/warning/critical background bands behind a chart,
// keyed off the y-axis scale so it works for both line and scatter charts.
function thresholdZonePlugin(warning, critical, yMax) {
  return {
    id: 'thresholdZones',
    beforeDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      const y = scales.y;
      if (!chartArea || !y) return;

      const top = chartArea.top;
      const bottom = chartArea.bottom;
      const left = chartArea.left;
      const width = chartArea.right - chartArea.left;

      const yWarning = y.getPixelForValue(warning);
      const yCritical = y.getPixelForValue(critical);
      const yTopVal = y.getPixelForValue(yMax !== undefined ? yMax : y.max);

      ctx.save();

      // healthy zone: from bottom axis up to warning line
      ctx.fillStyle = 'rgba(34, 197, 94, 0.05)';
      ctx.fillRect(left, Math.max(yWarning, top), width, Math.min(bottom, bottom) - Math.max(yWarning, top));

      // warning zone: warning -> critical
      ctx.fillStyle = 'rgba(245, 158, 11, 0.07)';
      ctx.fillRect(left, Math.max(yCritical, top), width, Math.max(0, Math.max(yWarning, top) - Math.max(yCritical, top)));

      // critical zone: critical -> top
      ctx.fillStyle = 'rgba(239, 68, 68, 0.08)';
      ctx.fillRect(left, top, width, Math.max(0, Math.max(yCritical, top) - top));

      ctx.restore();
    }
  };
}

function thresholdLineDatasets(cyclesLike, warning, critical) {
  const xs = cyclesLike;
  return [
    {
      label: 'Warning threshold',
      data: xs.map((x) => ({ x, y: warning })),
      borderColor: CHART_COLORS.amber,
      borderDash: [6, 5],
      borderWidth: 1.5,
      pointRadius: 0,
      fill: false,
      tension: 0,
      order: 0
    },
    {
      label: 'Critical threshold',
      data: xs.map((x) => ({ x, y: critical })),
      borderColor: CHART_COLORS.red,
      borderDash: [6, 5],
      borderWidth: 1.5,
      pointRadius: 0,
      fill: false,
      tension: 0,
      order: 0
    }
  ];
}

const baseGridOptions = {
  color: CHART_COLORS.grid,
  drawTicks: false
};

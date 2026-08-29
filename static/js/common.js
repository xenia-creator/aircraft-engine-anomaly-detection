// Shared chrome behavior: live clock in the topbar.
(function () {
  const clockEl = document.getElementById('topbar-clock');
  if (!clockEl) return;

  function tick() {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  }

  tick();
  setInterval(tick, 1000);
})();

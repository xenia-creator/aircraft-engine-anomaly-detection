// "How It Works" modal: step-by-step walkthrough of the anomaly detection pipeline.
// Present on every page via base.html. Pure CSS transforms/transitions drive all
// motion (step slides, open/close, drag) - no JS animation loops.
(function () {
  const openBtn = document.getElementById('how-it-works-btn');
  const overlay = document.getElementById('hiw-overlay');
  const modal = document.getElementById('hiw-modal');
  const header = document.getElementById('hiw-header');
  const closeBtn = document.getElementById('hiw-close-btn');
  const track = document.getElementById('hiw-track');
  const dots = Array.from(document.querySelectorAll('#hiw-dots .hiw-dot'));
  const prevBtn = document.getElementById('hiw-prev-btn');
  const nextBtn = document.getElementById('hiw-next-btn');

  if (!openBtn || !overlay || !modal || !track || !dots.length) return;

  const STEP_COUNT = dots.length;
  let current = 0;

  function goToStep(i) {
    current = Math.max(0, Math.min(STEP_COUNT - 1, i));
    track.style.transform = 'translateX(-' + (current * 100) + '%)';
    dots.forEach((d, idx) => d.classList.toggle('active', idx === current));
    prevBtn.disabled = current === 0;
    nextBtn.textContent = current === STEP_COUNT - 1 ? 'Done' : 'Next';
  }

  function resetPosition() {
    modal.classList.remove('hiw-modal--custom-pos');
    modal.style.left = '';
    modal.style.top = '';
  }

  function open() {
    resetPosition();
    goToStep(0);
    overlay.classList.add('open');
  }

  function close() {
    overlay.classList.remove('open');
  }

  openBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);

  prevBtn.addEventListener('click', () => goToStep(current - 1));
  nextBtn.addEventListener('click', () => {
    if (current === STEP_COUNT - 1) close();
    else goToStep(current + 1);
  });

  dots.forEach((dot, idx) => dot.addEventListener('click', () => goToStep(idx)));

  let dragMoved = false;

  document.addEventListener('click', (e) => {
    if (dragMoved) return;
    if (!overlay.classList.contains('open')) return;
    if (e.target === overlay) close();
  });

  document.addEventListener('keydown', (e) => {
    if (!overlay.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') goToStep(current + 1);
    else if (e.key === 'ArrowLeft') goToStep(current - 1);
  });

  // ---- dragging (reposition via the header, left-click only) ----
  let dragState = null;

  function onHeaderMouseMove(e) {
    if (!dragState) return;
    dragMoved = true;
    const maxLeft = Math.max(window.innerWidth - dragState.width, 0);
    const maxTop = Math.max(window.innerHeight - dragState.height, 0);
    const newLeft = Math.min(Math.max(dragState.startLeft + (e.clientX - dragState.startX), 0), maxLeft);
    const newTop = Math.min(Math.max(dragState.startTop + (e.clientY - dragState.startY), 0), maxTop);
    modal.style.left = newLeft + 'px';
    modal.style.top = newTop + 'px';
  }

  function onHeaderMouseUp() {
    if (!dragState) return;
    dragState = null;
    modal.classList.remove('dragging');
    document.body.classList.remove('hiw-no-select');
    document.removeEventListener('mousemove', onHeaderMouseMove);
    document.removeEventListener('mouseup', onHeaderMouseUp);
    setTimeout(() => { dragMoved = false; }, 0);
  }

  function onHeaderMouseDown(e) {
    if (e.button !== 0) return; // left-click drag only
    if (closeBtn.contains(e.target)) return;

    const rect = modal.getBoundingClientRect();
    dragState = {
      startX: e.clientX,
      startY: e.clientY,
      startLeft: rect.left,
      startTop: rect.top,
      width: rect.width,
      height: rect.height
    };
    modal.style.left = rect.left + 'px';
    modal.style.top = rect.top + 'px';
    modal.classList.add('hiw-modal--custom-pos', 'dragging');
    document.body.classList.add('hiw-no-select');
    document.addEventListener('mousemove', onHeaderMouseMove);
    document.addEventListener('mouseup', onHeaderMouseUp);
    e.preventDefault();
  }

  header.addEventListener('mousedown', onHeaderMouseDown);
})();

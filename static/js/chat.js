// Floating "Engine Assistant" chat widget, present on every page via base.html.
// Reads whatever the current page's own script has already rendered into the DOM
// (stat cards, engine/dataset selects, fleet counters) rather than reaching into
// each page's private closures, so it works unmodified on dashboard/lstm/fleet/
// lstm-fleet/comparison alike. History persists across page navigations via
// sessionStorage since this is a multi-page app with full reloads, not an SPA.
(function () {
  const HISTORY_KEY = 'chatHistory';
  const LANG_KEY = 'chatLanguage';
  const OPEN_KEY = 'chatOpen';

  const WELCOME = {
    english: "Hi! I'm your engine health assistant. Ask me about anomaly scores, thresholds, or a specific engine.",
    hindi: "नमस्ते! मैं आपका इंजन हेल्थ असिस्टेंट हूं। मुझसे anomaly score, threshold या किसी खास इंजन के बारे में पूछें।",
    kannada: "ನಮಸ್ಕಾರ! ನಾನು ನಿಮ್ಮ ಎಂಜಿನ್ ಹೆಲ್ತ್ ಅಸಿಸ್ಟೆಂಟ್. anomaly score, threshold ಅಥವಾ ಯಾವುದೇ ಎಂಜಿನ್ ಬಗ್ಗೆ ಕೇಳಿ."
  };

  const fab = document.getElementById('chat-fab');
  const panel = document.getElementById('chat-panel');
  const closeBtn = document.getElementById('chat-close-btn');
  const clearBtn = document.getElementById('chat-clear-btn');
  const messagesEl = document.getElementById('chat-messages');
  const typingEl = document.getElementById('chat-typing');
  const inputEl = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send-btn');
  const langBtns = document.querySelectorAll('.lang-btn');

  if (!fab || !panel || !messagesEl || !inputEl || !sendBtn) return;

  let history = [];
  let language = 'english';

  function loadState() {
    try {
      history = JSON.parse(sessionStorage.getItem(HISTORY_KEY) || '[]');
    } catch (e) {
      history = [];
    }
    language = sessionStorage.getItem(LANG_KEY) || 'english';
  }

  function saveHistory() {
    try {
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (e) {
      // storage unavailable/full - conversation just won't survive a reload
    }
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });
  }

  function appendBubble(role, content, scroll) {
    const row = document.createElement('div');
    row.className = 'chat-msg ' + (role === 'user' ? 'chat-msg-user' : 'chat-msg-assistant');
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    bubble.textContent = content;
    row.appendChild(bubble);
    messagesEl.appendChild(row);
    if (scroll !== false) scrollToBottom();
  }

  function renderMessages() {
    messagesEl.innerHTML = '';
    if (history.length === 0) {
      appendBubble('assistant', WELCOME[language] || WELCOME.english, false);
    } else {
      history.forEach((msg) => appendBubble(msg.role, msg.content, false));
    }
    scrollToBottom();
  }

  // ---- page context ----
  function getPageName() {
    const title = document.title || '';
    return title.split('·')[0].trim() || 'Dashboard';
  }

  function getPageContext() {
    const ctx = { page: getPageName() };

    const engineSelect = document.getElementById('engine-select');
    if (engineSelect && engineSelect.value) ctx.engine_id = engineSelect.value;

    const datasetSelect = document.getElementById('dataset-select');
    if (datasetSelect && datasetSelect.value) ctx.dataset = datasetSelect.value;

    const statusBadge = document.getElementById('stat-status-badge');
    if (statusBadge) {
      const text = statusBadge.textContent.trim();
      if (text && text !== '—') ctx.status = text.toUpperCase();
    }

    const latestError = document.getElementById('stat-latest-error');
    if (latestError && latestError.textContent.trim() !== '—') {
      ctx.latest_error = latestError.textContent.trim();
    }

    const totalCycles = document.getElementById('stat-total-cycles');
    if (totalCycles) {
      const text = totalCycles.textContent.replace(/cycles/i, '').trim();
      if (text && text !== '—') ctx.total_cycles = text;
    }

    const firstWarning = document.getElementById('stat-first-warning');
    if (firstWarning && firstWarning.textContent.trim() !== '—') {
      ctx.first_warning = firstWarning.textContent.trim();
    }

    const warningNote = document.getElementById('stat-warning-note');
    if (warningNote) {
      const match = warningNote.textContent.match(/First critical cycle:\s*(.+)/i);
      if (match && match[1].trim() && match[1].trim() !== '—') {
        ctx.first_critical = match[1].trim();
      }
    }

    const rulBadge = document.getElementById('rul-badge');
    const rulValue = document.getElementById('rul-value');
    if (rulBadge && rulValue && rulBadge.style.display !== 'none') {
      ctx.rul = rulValue.textContent.trim();
    }

    // fleet-style pages have no single selected engine - surface fleet counts instead
    const countHealthy = document.getElementById('count-healthy');
    const countWarning = document.getElementById('count-warning');
    const countCritical = document.getElementById('count-critical');
    if (countHealthy && countWarning && countCritical) {
      ctx.fleet_healthy = countHealthy.textContent.trim();
      ctx.fleet_warning = countWarning.textContent.trim();
      ctx.fleet_critical = countCritical.textContent.trim();
    }

    return ctx;
  }

  // ---- sending ----
  async function sendMessage() {
    const text = inputEl.value.trim();
    if (!text) return;

    const priorHistory = history.slice();

    appendBubble('user', text);
    history.push({ role: 'user', content: text });
    saveHistory();

    inputEl.value = '';
    autoResizeInput();
    updateSendState();

    typingEl.hidden = false;
    scrollToBottom();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          context: getPageContext(),
          history: priorHistory,
          language: language
        })
      });
      const data = await res.json();
      typingEl.hidden = true;
      const reply = data.response || 'Sorry, something went wrong. Please try again.';
      appendBubble('assistant', reply);
      history.push({ role: 'assistant', content: reply });
      saveHistory();
    } catch (err) {
      typingEl.hidden = true;
      appendBubble('assistant', 'Connection error. Please try again.');
    }
  }

  function updateSendState() {
    const hasText = inputEl.value.trim().length > 0;
    sendBtn.classList.toggle('active', hasText);
    sendBtn.disabled = !hasText;
  }

  function autoResizeInput() {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
  }

  // ---- panel open/close ----
  function openPanel() {
    panel.classList.add('open');
    fab.classList.add('is-open');
    fab.setAttribute('aria-label', 'Close Engine Assistant');
    sessionStorage.setItem(OPEN_KEY, '1');
    scrollToBottom();
    setTimeout(() => inputEl.focus(), 200);
  }

  function closePanel() {
    panel.classList.remove('open');
    fab.classList.remove('is-open');
    fab.setAttribute('aria-label', 'Open Engine Assistant');
    sessionStorage.setItem(OPEN_KEY, '0');
  }

  function setLanguage(lang) {
    language = lang;
    sessionStorage.setItem(LANG_KEY, language);
    langBtns.forEach((b) => b.classList.toggle('active', b.dataset.lang === language));
    if (history.length === 0) renderMessages();
  }

  // ---- wire up ----
  fab.addEventListener('click', () => {
    if (panel.classList.contains('open')) closePanel();
    else openPanel();
  });
  closeBtn.addEventListener('click', closePanel);

  clearBtn.addEventListener('click', () => {
    history = [];
    saveHistory();
    renderMessages();
  });

  inputEl.addEventListener('input', () => {
    updateSendState();
    autoResizeInput();
  });
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  sendBtn.addEventListener('click', sendMessage);

  langBtns.forEach((btn) => {
    btn.addEventListener('click', () => setLanguage(btn.dataset.lang));
  });

  // ---- init ----
  loadState();
  renderMessages();
  langBtns.forEach((b) => b.classList.toggle('active', b.dataset.lang === language));
  updateSendState();
  if (sessionStorage.getItem(OPEN_KEY) === '1') openPanel();
})();

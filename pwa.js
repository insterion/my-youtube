/* My YouTube PWA 1.1 — robust Android Share receiver and offline/update controls.
   Does not modify app.js or any saved video, channel or API-key data. */
(function () {
  'use strict';

  const PENDING_KEY = 'my-youtube-pending-share-v2';
  const MAX_PENDING_AGE = 10 * 60 * 1000;
  const params = new URLSearchParams(window.location.search);
  const incomingShare = params.get('share_target') === '1';
  const requestedPage = params.get('page');
  const incomingValues = [params.get('url'), params.get('text'), params.get('title')];

  // Only supported video links are accepted; no arbitrary external URLs are opened.
  function extractYouTubeUrl(values) {
    for (const value of values) {
      let raw = String(value || '').trim();
      if (!raw) continue;
      // Support both ordinary Android shares and URLs pasted inside text/title.
      try {
        if (!raw.includes('://') && /https?%3A%2F%2F/i.test(raw)) {
          raw = decodeURIComponent(raw);
        }
      } catch (_) { /* Ignore malformed encoded text. */ }
      const found = raw.match(/https?:\/\/[^\s<>"']+/gi) || [];
      for (const candidate of [...found, raw]) {
        const clean = candidate.replace(/[),.;!?\]\}]+$/, '');
        if (typeof parseYouTubeVideoId === 'function' && parseYouTubeVideoId(clean)) {
          // Canonical form strips unrelated query parameters and shared timestamps.
          return 'https://www.youtube.com/watch?v=' + parseYouTubeVideoId(clean);
        }
      }
    }
    return '';
  }

  let pending = null;
  function readPending() {
    try {
      const stored = JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null');
      if (stored && typeof stored.url === 'string' &&
          Date.now() - stored.savedAt < MAX_PENDING_AGE) return stored;
      sessionStorage.removeItem(PENDING_KEY);
    } catch (_) { /* Private storage may be disabled. */ }
    return null;
  }
  function savePending(url) {
    pending = { url, savedAt: Date.now() };
    try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending)); } catch (_) {}
  }
  function clearPending() {
    pending = null;
    try { sessionStorage.removeItem(PENDING_KEY); } catch (_) {}
  }

  // Capture incoming data immediately, before asynchronous channel refreshes can rerender the page.
  const sharedUrl = incomingShare ? extractYouTubeUrl(incomingValues) : '';
  if (incomingShare && sharedUrl) savePending(sharedUrl);
  else pending = readPending();

  function clearLaunchUrl() {
    if (!incomingShare && !requestedPage) return;
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (_) {}
  }

  function showMessage(message, valid) {
    const form = document.getElementById('queue-import-form');
    if (!form) return;
    let note = document.getElementById('pwa-share-status');
    if (!note) {
      note = document.createElement('div');
      note.id = 'pwa-share-status';
      note.className = 'pwa-shared-note';
      note.setAttribute('role', 'status');
      form.before(note);
    }
    note.textContent = message;
    note.style.borderColor = valid ? '#60a5fa' : '#fbbf24';
  }

  function addPasteButton() {
    const form = document.getElementById('queue-import-form');
    const field = document.getElementById('queue-import-url');
    if (!form || !field || document.getElementById('pwa-paste-button')) return;
    const button = document.createElement('button');
    button.id = 'pwa-paste-button';
    button.type = 'button';
    button.textContent = 'Paste link from clipboard';
    button.style.cssText = 'background:#172b47;border:1px solid #4c719e;color:#dbeafe;';
    button.addEventListener('click', async () => {
      try {
        if (!navigator.clipboard || !navigator.clipboard.readText) throw new Error('Clipboard unavailable');
        const text = await navigator.clipboard.readText();
        const link = extractYouTubeUrl([text]);
        if (!link) {
          showMessage('Clipboard does not contain a recognised YouTube video link. You can paste the link manually.', false);
          field.focus();
          return;
        }
        clearPending();
        field.value = link;
        field.focus();
        showMessage('Link pasted. Tap “Add to Queue” to confirm.', true);
      } catch (_) {
        showMessage('Android could not read the clipboard automatically. Long-press the link field and choose Paste.', false);
        field.focus();
      }
    });
    field.after(button);
  }

  let lastField = null;
  function syncQueueForm() {
    const field = document.getElementById('queue-import-url');
    if (!field) return;
    addPasteButton();
    // A refreshed or rerendered Queue creates a NEW input. Restore the pending link to that input.
    if (pending && Date.now() - pending.savedAt < MAX_PENDING_AGE) {
      if (field !== lastField || !field.value.trim()) {
        if (!field.value.trim()) field.value = pending.url;
        showMessage('YouTube link received from Android Share. Tap “Add to Queue” to confirm.', true);
      }
    } else if (incomingShare && !sharedUrl) {
      const receivedData = incomingValues.some(v => String(v || '').trim());
      showMessage(receivedData
        ? 'Android sent shared text, but no supported YouTube video link was found. Copy the link and use Paste link below.'
        : 'My YouTube opened, but Android did not provide a link. Copy the video URL and use Paste link below.', false);
    }
    lastField = field;
  }

  function handleLaunch() {
    if (incomingShare || (pending && !requestedPage)) {
      if (typeof navigateToPage === 'function') navigateToPage('queue');
    } else if (['home', 'new', 'search', 'queue'].includes(requestedPage)) {
      if (typeof navigateToPage === 'function') navigateToPage(requestedPage);
    }
    syncQueueForm();
    // app.js can refresh channels asynchronously and render Queue again. Keep the link during this process.
    const content = document.querySelector('.video-list');
    if (content) {
      const observer = new MutationObserver(syncQueueForm);
      observer.observe(content, {childList: true, subtree: true});
    }
    // A successful user submit or manual input change ends pending share restoration.
    document.addEventListener('submit', (event) => {
      if (event.target && event.target.id === 'queue-import-form') clearPending();
    }, true);
    document.addEventListener('input', (event) => {
      if (event.target && event.target.id === 'queue-import-url') clearPending();
    }, true);
    clearLaunchUrl();
  }

  function setupOfflineBanner() {
    const banner = document.createElement('div');
    banner.className = 'pwa-offline-note';
    banner.hidden = true;
    banner.setAttribute('role', 'status');
    banner.textContent = 'Offline: your saved library is available. YouTube search and videos need internet.';
    document.querySelector('.app-header')?.after(banner);
    function sync() { banner.hidden = navigator.onLine; }
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    sync();
  }

  function setupUpdateBanner(registration) {
    let banner = null;
    const prompt = () => {
      if (!registration.waiting || !navigator.serviceWorker.controller || banner) return;
      banner = document.createElement('div');
      banner.className = 'pwa-banner';
      banner.setAttribute('role', 'status');
      const text = document.createElement('span');
      text.textContent = 'A new My YouTube version is ready.';
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Update now';
      button.addEventListener('click', () => registration.waiting?.postMessage({type: 'SKIP_WAITING'}));
      banner.append(text, button);
      document.body.appendChild(banner);
    };
    if (registration.waiting) prompt();
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed') prompt();
      });
    });
    let refreshed = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshed) { refreshed = true; location.reload(); }
    });
    window.addEventListener('focus', () => registration.update().catch(() => {}));
  }

  document.addEventListener('DOMContentLoaded', () => {
    handleLaunch();
    setupOfflineBanner();
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js', {updateViaCache: 'none'})
          .then(setupUpdateBanner)
          .catch(error => console.warn('PWA offline support is unavailable:', error));
      });
    }
  });
})();

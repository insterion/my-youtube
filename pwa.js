/* My YouTube PWA 1.3 — automatically queue Android-shared YouTube videos.
   Does not modify app.js or any saved video, channel or API-key data. */
(function () {
  'use strict';

  const PENDING_KEY = 'my-youtube-pending-share-v3';
  const MAX_PENDING_AGE = 10 * 60 * 1000;
  const params = new URLSearchParams(window.location.search);
  // Some Android share launches omit the action's extra query flag.
  // Detect actual shared fields as well as the explicit share flag.
  const autoQueueRequested = params.get('auto_queue') === '1';
  const incomingShare = params.get('share_target') === '1' || autoQueueRequested ||
    params.has('text') || params.has('url') || params.has('title');
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
          Number.isFinite(stored.savedAt) && stored.savedAt <= Date.now() &&
          Date.now() - stored.savedAt < MAX_PENDING_AGE &&
          extractYouTubeUrl([stored.url])) return stored;
      sessionStorage.removeItem(PENDING_KEY);
    } catch (_) { /* Private storage may be disabled. */ }
    return null;
  }
  function persistPending() {
    try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending)); } catch (_) {}
  }
  function savePending(url, autoAdd) {
    pending = { url, savedAt: Date.now(), autoAdd: autoAdd === true, attempted: false };
    persistPending();
  }
  function clearPending() {
    pending = null;
    try { sessionStorage.removeItem(PENDING_KEY); } catch (_) {}
  }

  // Capture incoming data immediately, before asynchronous channel refreshes can rerender the page.
  const sharedUrl = incomingShare ? extractYouTubeUrl(incomingValues) : '';
  if (incomingShare && sharedUrl) savePending(sharedUrl, autoQueueRequested);
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
    // The Queue is watched by MutationObserver. Avoid updating unchanged text,
    // otherwise a failed import could trigger an endless observer loop.
    if (note.textContent !== message) note.textContent = message;
    const border = valid ? '#60a5fa' : '#fbbf24';
    if (note.style.borderColor !== border) note.style.borderColor = border;
  }

  // Clipboard read permission may be denied by Android/Brave. Avoid a misleading Paste button;
  // tell the user how to use the keyboard's native Paste action instead.
  function addPasteHelp() {
    const form = document.getElementById('queue-import-form');
    const field = document.getElementById('queue-import-url');
    if (!form || !field || document.getElementById('pwa-paste-help')) return;
    const button = document.createElement('button');
    button.id = 'pwa-paste-help';
    button.type = 'button';
    button.textContent = 'How to paste a link';
    button.style.cssText = 'background:#172b47;border:1px solid #4c719e;color:#dbeafe;';
    button.addEventListener('click', () => {
      showMessage('Copy the YouTube link in Brave, tap and hold the link field above, then choose Paste from the Android menu or keyboard.', false);
      field.focus();
    });
    field.after(button);
  }

  function syncQueueForm() {
    const form = document.getElementById('queue-import-form');
    const field = document.getElementById('queue-import-url');
    if (!field || !form) return;
    addPasteHelp();

    if (pending && Date.now() - pending.savedAt < MAX_PENDING_AGE) {
      const id = typeof parseYouTubeVideoId === 'function' ? parseYouTubeVideoId(pending.url) : null;
      if (id && typeof isQueued === 'function' && isQueued(id)) {
        showMessage(pending.autoAdd && pending.attempted
          ? '✓ Automatically added to Watch Queue.'
          : 'This video is already in your Watch Queue. No duplicate was added.', true);
        clearPending();
        return;
      }

      if (!field.value.trim()) field.value = pending.url;
      if (!pending.autoAdd) {
        showMessage('YouTube link received. Tap “Add to Queue” to confirm.', true);
      } else if (pending.attempted) {
        showMessage(typeof queueImportInProgress !== 'undefined' && queueImportInProgress
          ? 'Adding your shared video to Watch Queue…'
          : 'If the video was not added, check the message below. The link is kept for a manual retry.', false);
      } else {
        showMessage('Adding your shared video automatically…', true);
        // Mark before submitting to prevent another submit if app.js redraws the form.
        if (field.value.trim() === pending.url && !form.querySelector('button[type="submit"]')?.disabled) {
          pending.attempted = true;
          persistPending();
          // app.js already binds the form's submit handler to the same import logic.
          // requestSubmit invokes its normal validation and error handling.
          if (typeof form.requestSubmit === 'function') form.requestSubmit();
          else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
          // A missing API key is rejected immediately, without a new page render.
          if (pending && pending.attempted &&
              typeof queueImportInProgress !== 'undefined' && !queueImportInProgress &&
              !(id && typeof isQueued === 'function' && isQueued(id))) {
            showMessage('Automatic addition could not finish. Check the message below; the link is kept for a retry.', false);
          }
        }
      }
    } else if (incomingShare && !sharedUrl) {
      const receivedData = incomingValues.some(v => String(v || '').trim());
      showMessage(receivedData
        ? 'Android sent shared text, but no supported YouTube video link was found. Long-press the field to Paste.'
        : 'My YouTube opened, but Android did not provide a link. Long-press the field to Paste.', false);
    }
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
    // Keep a pending URL until the app confirms it is queued, including failed API requests.
    // Manual edits cancel pending auto-add so the user's typed link wins.
    document.addEventListener('submit', (event) => {
      if (event.target && event.target.id === 'queue-import-form') {
        const field = document.getElementById('queue-import-url');
        const cleaned = field && extractYouTubeUrl([field.value]);
        if (cleaned) field.value = cleaned;
      }
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

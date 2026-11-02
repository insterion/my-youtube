/* My YouTube PWA 1.0 — install support, offline status, update prompt and Android Share receiver.
   The existing app.js and its video/library storage remain untouched. */
(function () {
  'use strict';
  const params = new URLSearchParams(location.search);
  const fromShare = params.get('share_target') === '1';
  const requestedPage = params.get('page');

  function extractYouTubeUrl(values) {
    for (const value of values) {
      const raw = String(value || '').trim();
      if (!raw) continue;
      // Android often sends "A video title https://youtu.be/..." in text, not url.
      const urls = raw.match(/https?:\/\/[^\s<>"']+/gi) || [];
      const candidates = [...urls, raw];
      for (const maybeUrl of candidates) {
        const candidate = maybeUrl.replace(/[),.;!?]+$/, '');
        if (typeof parseYouTubeVideoId === 'function' && parseYouTubeVideoId(candidate)) {
          return candidate;
        }
      }
    }
    return '';
  }

  function clearUrlParameters() {
    if (fromShare || requestedPage) {
      try { history.replaceState(null, '', location.pathname + location.hash); }
      catch (error) { /* Not fatal if browser history is restricted. */ }
    }
  }

  function receiveShareOrShortcut() {
    try {
      if (fromShare) {
        const link = extractYouTubeUrl([params.get('url'), params.get('text'), params.get('title')]);
        if (typeof navigateToPage === 'function') navigateToPage('queue');
        const field = document.getElementById('queue-import-url');
        if (field && link) {
          field.value = link;
          const note = document.createElement('div');
          note.className = 'pwa-shared-note';
          note.setAttribute('role', 'status');
          note.textContent = 'Video link received from Android Share. Tap “Add to Queue” to confirm.';
          field.closest('form')?.before(note);
          field.focus();
        } else {
          const target = document.querySelector('.queue-feedback');
          if (target) target.textContent = 'No supported YouTube video link was shared. Paste a video link above.';
        }
      } else if (['home', 'new', 'search', 'queue'].includes(requestedPage)) {
        if (typeof navigateToPage === 'function') navigateToPage(requestedPage);
      }
    } finally {
      clearUrlParameters();
    }
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
    // A page can stay open for a while; check for updates on focus and online returns.
    window.addEventListener('focus', () => registration.update().catch(() => {}));
  }

  document.addEventListener('DOMContentLoaded', () => {
    receiveShareOrShortcut();
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

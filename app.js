/* =========================================
   MY YOUTUBE
   Main application logic
   Maintenance release 1.3.6 (2026-11-02)
   Helpers in youtube-utils.js; API in youtube-api.js; storage in library-storage.js; backup in backup-manager.js; UI in ui-navigation.js.
   Preserves existing storage keys and app features.

   Added:
   - Settings screen
   - API key management
   - Channel management
   - Watched / Saved / Downloaded status
   - Automatic refresh
   - NEW video tracking
   ========================================= */

const VIDEO_STORAGE_KEY = "my-youtube-videos";
const CHANNEL_STORAGE_KEY = "my-youtube-channels";
const PAGE_STORAGE_KEY = "my-youtube-page";
const API_KEY_STORAGE_KEY = "my-youtube-api-key";
const LAST_REFRESH_KEY = "my-youtube-last-refresh";
const SEARCH_PREFS_KEY = "my-youtube-search-preferences";
// Watch Queue is an ordered list of existing video IDs, backed up with the library.
const WATCH_QUEUE_KEY = "my-youtube-watch-queue-v1";
const WATCH_QUEUE_LIMIT = 500;
// Smart Feed only filters locally stored uploads from followed channels.
const SMART_FEED_KEY = "my-youtube-smart-feed-v1";
const SMART_FEED_STATUSES = ["all", "unwatched", "new", "saved", "watched"];
const SMART_FEED_SORTS = ["newest", "oldest", "longest", "shortest"];
function normalizeSmartFeedPrefs(value, allowedChannelIds = null) {
    const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const validIds = allowedChannelIds ? new Set(allowedChannelIds) : null;
    const rules = {};
    const inputRules = raw.rules && typeof raw.rules === "object" && !Array.isArray(raw.rules)
        ? raw.rules : {};
    Object.keys(inputRules).slice(0, 1000).forEach(id => {
        if (!/^[A-Za-z0-9_-]{1,150}$/.test(id) || (validIds && !validIds.has(id))) return;
        const rule = inputRules[id];
        if (!rule || typeof rule !== "object" || Array.isArray(rule)) return;
        rules[id] = {
            enabled: rule.enabled !== false,
            minMinutes: Number.isInteger(rule.minMinutes) && rule.minMinutes >= 0 && rule.minMinutes <= 600
                ? rule.minMinutes : 0
        };
    });
    return {
        channelId: typeof raw.channelId === "string" &&
            (!validIds || validIds.has(raw.channelId)) ? raw.channelId.slice(0, 150) : "",
        query: typeof raw.query === "string" ? raw.query.slice(0, 150) : "",
        minMinutes: Number.isInteger(raw.minMinutes) && raw.minMinutes >= 0 && raw.minMinutes <= 600
            ? raw.minMinutes : 0,
        status: SMART_FEED_STATUSES.includes(raw.status) ? raw.status : "unwatched",
        sort: SMART_FEED_SORTS.includes(raw.sort) ? raw.sort : "newest",
        rules
    };
}
function loadSmartFeedPrefs() {
    try { return normalizeSmartFeedPrefs(JSON.parse(localStorage.getItem(SMART_FEED_KEY) || "null")); }
    catch (error) { return normalizeSmartFeedPrefs(null); }
}
function saveSmartFeedPrefs() {
    try { localStorage.setItem(SMART_FEED_KEY, JSON.stringify(smartFeedPrefs)); }
    catch (error) { console.warn("Could not save Smart Feed preferences.", error); }
}

// Customize Home only changes presentation; it never changes videos or API calls.
const HOME_LAYOUT_KEY = "my-youtube-home-layout-v1";
const HOME_SECTION_IDS = ["watchNext", "channels", "searches", "recent"];
const HOME_SECTION_NAMES = {
    watchNext: "Watch next",
    channels: "Your channels",
    searches: "Saved searches",
    recent: "New / recent videos"
};
function normalizeHomeLayout(candidate) {
    const value = candidate && typeof candidate === "object" && !Array.isArray(candidate)
        ? candidate : {};
    const inputOrder = Array.isArray(value.order) ? value.order : [];
    const order = [...new Set(inputOrder.filter(id => HOME_SECTION_IDS.includes(id)))];
    HOME_SECTION_IDS.forEach(id => { if (!order.includes(id)) order.push(id); });
    const storedVisibility = value.visible && typeof value.visible === "object" &&
        !Array.isArray(value.visible) ? value.visible : {};
    const visible = Object.fromEntries(HOME_SECTION_IDS.map(id => [id, storedVisibility[id] !== false]));
    return { order, visible };
}
function loadHomeLayout() {
    try {
        return normalizeHomeLayout(JSON.parse(localStorage.getItem(HOME_LAYOUT_KEY) || "null"));
    } catch (error) {
        return normalizeHomeLayout(null);
    }
}
function saveHomeLayout() {
    try {
        localStorage.setItem(HOME_LAYOUT_KEY, JSON.stringify(homeLayout));
    } catch (error) {
        console.log("Home preferences could not be saved in Chrome.", error);
    }
}

// Cosmetic library controls only. Video data and backups are never modified by these.
const LIBRARY_VIEW_KEY = "my-youtube-library-view-v1";
const LIBRARY_PAGES = ["new", "saved", "watched"];
const LIBRARY_SORTS = ["newest", "oldest", "longest", "shortest"];
const LIBRARY_DEFAULT_VIEW = { query: "", channel: "", sort: "newest", compact: false };
function loadLibraryViewPrefs() {
    let stored = {};
    try {
        const parsed = JSON.parse(localStorage.getItem(LIBRARY_VIEW_KEY) || "{}");
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) stored = parsed;
    } catch (error) {
        console.log("Could not read library display preferences.", error);
    }
    return Object.fromEntries(LIBRARY_PAGES.map(page => {
        const value = stored[page] && typeof stored[page] === "object" ? stored[page] : {};
        return [page, {
            query: typeof value.query === "string" ? value.query.slice(0, 150) : "",
            channel: typeof value.channel === "string" ? value.channel : "",
            sort: LIBRARY_SORTS.includes(value.sort) ? value.sort : "newest",
            compact: value.compact === true
        }];
    }));
}
function saveLibraryViewPrefs() {
    try {
        localStorage.setItem(LIBRARY_VIEW_KEY, JSON.stringify(libraryViewPrefs));
    } catch (error) {
        console.log("Could not save display preferences; controls still work.", error);
    }
}

// Sorting changes only the videos already found; no extra YouTube API requests.
const SEARCH_RESULTS_SORT_KEY = "my-youtube-search-result-sort";
const SEARCH_RESULTS_SORT_OPTIONS = ["newest", "oldest", "longest", "shortest"];
function normalizeSearchResultSort(value) {
    return SEARCH_RESULTS_SORT_OPTIONS.includes(value) ? value : "newest";
}
function loadSearchResultSort() {
    try {
        return normalizeSearchResultSort(localStorage.getItem(SEARCH_RESULTS_SORT_KEY));
    } catch (error) {
        return "newest";
    }
}
// Supports durations shown in video cards, e.g. 47m 15s or 1h 04m.
// durationSecondsForSorting is provided by youtube-utils.js (loaded before app.js).
// Never mutate searchResults: cache and Saved/Watched states remain untouched.
function getSortedSearchResults(results, sortMode) {
    const mode = normalizeSearchResultSort(sortMode);
    return results.map((video, index) => ({ video, index }))
        .sort((first, second) => {
            const dateA = Date.parse(first.video.publishedAt || "");
            const dateB = Date.parse(second.video.publishedAt || "");
            const timeA = Number.isFinite(dateA) ? dateA : 0;
            const timeB = Number.isFinite(dateB) ? dateB : 0;
            if (mode === "newest") return (timeB - timeA) || (first.index - second.index);
            if (mode === "oldest") return (timeA - timeB) || (first.index - second.index);
            const durationA = durationSecondsForSorting(first.video.duration);
            const durationB = durationSecondsForSorting(second.video.duration);
            // Videos without duration appear after videos with known duration.
            if (durationA === null && durationB !== null) return 1;
            if (durationB === null && durationA !== null) return -1;
            const difference = (durationA || 0) - (durationB || 0);
            return (mode === "longest" ? -difference : difference) ||
                (timeB - timeA) || (first.index - second.index);
        })
        .map(item => item.video);
}
// Rolling published-date periods measured back from the time of searching.
const SEARCH_PERIOD_HOURS = { any: 0, day: 24, week: 24 * 7, month: 24 * 30 };
// Controls how many pages of YouTube candidates a manual search may inspect.
// Default remains the existing 3 pages. More pages consume more API requests.
const SEARCH_DEPTH_PAGES = [1, 3, 5];
function normalizeSearchDepth(value) {
    return SEARCH_DEPTH_PAGES.includes(Number(value)) ? Number(value) : 3;
}
function searchDepthLabel(value) {
    const labels = { 1: "Quick", 3: "Standard", 5: "Thorough" };
    return labels[normalizeSearchDepth(value)];
}

function normalizeSearchPeriod(value) {
    return Object.prototype.hasOwnProperty.call(SEARCH_PERIOD_HOURS, value)
        ? value : "any";
}

function searchPeriodLabel(value) {
    const labels = { any: "Any time", day: "Last 24 hours", week: "Last 7 days", month: "Last 30 days" };
    return labels[normalizeSearchPeriod(value)];
}
const SAVED_SEARCHES_KEY = "my-youtube-saved-searches";
// Short-lived search results; not part of Backup & Restore.
const SEARCH_CACHE_KEY = "my-youtube-search-cache-v2";
const SEARCH_CACHE_TTL = 10 * 60 * 1000;
const SEARCH_CACHE_MAX_ENTRIES = 8;
// Browser-only request counter; independent of Backup & Restore.
const API_USAGE_KEY = "my-youtube-api-usage-v1";
const DEFAULT_DAILY_SEARCH_LIMIT = 100;
const BACKUP_FORMAT = "my-youtube";
const BACKUP_VERSION = 1;

const AUTO_REFRESH_INTERVAL = 60 * 60 * 1000;
// Check whether an update is due; do not poll the YouTube API every minute.
const AUTO_REFRESH_CHECK_INTERVAL = 60 * 1000;
// Avoid repeated requests during outages; manual Refresh remains available.
const AUTO_REFRESH_RETRY_INTERVAL = 15 * 60 * 1000;
let lastAutomaticRefreshAttempt = 0;

let videos = [];
let channels = [];
let watchQueue = [];
let smartFeedPrefs = loadSmartFeedPrefs();
let smartFeedRulesOpen = false;
let queueMessage = "";
let queueImportInProgress = false;
let currentPage = localStorage.getItem(PAGE_STORAGE_KEY) || "home";
let refreshInProgress = false;
let storageIntegrityIssue = "";

// Search is user-initiated only. Preferences persist; results stay in memory.
let searchPreferences = loadSearchPreferences();
let savedSearches = loadSavedSearches();
let editingSavedSearchId = null;
let searchPreferencesBeforeEdit = null;
let searchResults = [];
let searchResultSort = loadSearchResultSort();
let searchInProgress = false;
let searchResultMessage = "Enter a topic and tap Search YouTube.";
let searchWasRun = false;
let searchCache = loadSearchCache();
let libraryViewPrefs = loadLibraryViewPrefs();
let homeLayout = loadHomeLayout();
let homeEditorOpen = false;
// Bulk selection is temporary UI state. Individual video states are saved as usual.
let librarySelectMode = false;
let librarySelectedIds = new Set();
// In-memory navigation only. No extra storage or backup fields are needed.
let activeChannelId = null;
let activeChannelVideoFilter = "all";

/* =========================================
   SEARCH CACHE
   - Keeps at most 8 searches for 10 minutes.
   - Saved locally; never included in a backup.
   - Any storage error only disables caching, not searching.
   ========================================= */

function isValidSearchCacheEntry(entry, now = Date.now()) {
    return entry && typeof entry.key === "string" &&
        Number.isFinite(entry.savedAt) && entry.savedAt > 0 &&
        entry.savedAt <= now && now - entry.savedAt < SEARCH_CACHE_TTL &&
        Array.isArray(entry.results) && entry.results.length <= 20;
}

function loadSearchCache() {
    try {
        const stored = JSON.parse(localStorage.getItem(SEARCH_CACHE_KEY) || "[]");
        if (!Array.isArray(stored)) return [];
        return stored.filter(item => isValidSearchCacheEntry(item))
            .slice(0, SEARCH_CACHE_MAX_ENTRIES);
    } catch (error) {
        console.log("Could not read search cache.", error);
        return [];
    }
}

function searchCacheKey(preferences) {
    // Different durations and result limits always get separate results.
    return JSON.stringify([
        preferences.query.trim().replace(/\s+/g, " ").toLocaleLowerCase(),
        preferences.minMinutes,
        preferences.resultLimit,
        normalizeSearchPeriod(preferences.period),
        normalizeSearchDepth(preferences.searchDepth)
    ]);
}

function getCachedSearch(preferences) {
    const key = searchCacheKey(preferences);
    const now = Date.now();
    searchCache = searchCache.filter(item => isValidSearchCacheEntry(item, now));
    const entry = searchCache.find(item => item.key === key);
    if (!entry) return null;
    // Copy the objects; buttons merge the current Watched/Saved state later.
    return { results: entry.results.map(item => ({ ...item })), savedAt: entry.savedAt };
}

function rememberSearchResults(preferences, results) {
    const key = searchCacheKey(preferences);
    searchCache = searchCache.filter(item =>
        isValidSearchCacheEntry(item) && item.key !== key
    );
    searchCache.unshift({
        key,
        savedAt: Date.now(),
        results: results.map(item => ({ ...item }))
    });
    searchCache = searchCache.slice(0, SEARCH_CACHE_MAX_ENTRIES);
    try {
        localStorage.setItem(SEARCH_CACHE_KEY, JSON.stringify(searchCache));
    } catch (error) {
        console.log("Search cache not saved; searching still works.", error);
    }
}

function clearSearchCache() {
    searchCache = [];
    try {
        localStorage.removeItem(SEARCH_CACHE_KEY);
    } catch (error) {
        console.log("Could not clear search cache.", error);
    }
}

/* =========================================
   LOCAL API USAGE TRACKER
   - Counts API requests made by this browser, starting with this version.
   - search.list has its own default 100-request/day quota (as of Oct 2026).
   - Other reads are tracked separately; this is NOT Google Cloud quota data.
   - Quota days start at midnight Pacific Time, not UK midnight.
   - Network failures may or may not count at Google; these are attempts.
   - Counter is device-local and not part of Backup & Restore.
   ========================================= */

// pacificQuotaDay, getLocalApiUsage and recordLocalApiCall are provided by youtube-api.js.

function apiUsageHtml() {
    const usage = getLocalApiUsage();
    const nearLimit = usage.searches >= 80;
    return `
        <div style="padding:12px;background:#0f172a;border:1px solid #334155;
                    border-radius:10px;box-sizing:border-box;">
            <div style="font-weight:600;color:${nearLimit ? "#fbbf24" : "#e2e8f0"};">
                Search API calls today: ${usage.searches} / ${DEFAULT_DAILY_SEARCH_LIMIT}
            </div>
            <div style="margin-top:5px;font-size:12px;color:#94a3b8;">
                Other API calls: ${usage.other}. Tracked only in this Chrome
                since this feature was installed. Daily reset: midnight Pacific Time.
                Google's actual account usage may differ.
            </div>
            ${nearLimit ? `<div style="margin-top:8px;font-size:12px;color:#fbbf24;">
                Near the default daily search limit. Reuse cached searches where possible.
            </div>` : ""}
        </div>`;
}

/* =========================================
   API KEY
   ========================================= */

function getApiKey() {
    return localStorage.getItem(API_KEY_STORAGE_KEY) || "";
}

function saveApiKey(apiKey) {
    localStorage.setItem(API_KEY_STORAGE_KEY, apiKey.trim());
}

function removeApiKey() {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
}

/* =========================================
   CRITICAL DATA SAFETY
   Integrity checks and write guards are in library-storage.js.
   A validated Restore can safely unlock normal writes.
   ========================================= */


function canModifyLibrary() {
    if (!storageIntegrityIssue) return true;
    alert("Saved data needs recovery. Restore a valid backup in Settings before making changes.");
    return false;
}

function showStorageIntegrityWarning() {
    if (document.getElementById("storage-integrity-warning")) return;
    const banner = document.createElement("section");
    banner.id = "storage-integrity-warning";
    banner.setAttribute("role", "alert");
    banner.style.cssText = "margin:12px;padding:16px;background:#4a1e23;color:#fff;border:2px solid #fca5a5;border-radius:12px;";
    const title = document.createElement("strong");
    title.textContent = "Saved data needs recovery";
    const note = document.createElement("p");
    note.textContent = "A saved list could not be read. To prevent data loss, changes and automatic refresh are paused. Restore a known-good backup in Settings. Do not clear Chrome site data.";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Open Settings to restore a backup";
    button.addEventListener("click", openSettings);
    banner.append(title, note, button);
    const header = document.querySelector(".app-header");
    if (header) header.after(banner);
    else document.body.prepend(banner);
}

/* =========================================
   STORAGE
   Persistent library functions now live in library-storage.js.
   ========================================= */





function getLastRefreshTime() {
    const saved = localStorage.getItem(LAST_REFRESH_KEY);
    if (!saved) return 0;

    const value = Number(saved);
    return Number.isNaN(value) ? 0 : value;
}

function saveLastRefreshTime() {
    localStorage.setItem(LAST_REFRESH_KEY, String(Date.now()));
}

/* =========================================
   SEARCH PREFERENCES
   ========================================= */

function loadSearchPreferences() {
    const defaults = { query: "", minMinutes: 40, resultLimit: 10, period: "any", searchDepth: 3 };
    try {
        const saved = JSON.parse(localStorage.getItem(SEARCH_PREFS_KEY) || "null");
        if (!saved || typeof saved !== "object") return defaults;
        const minutes = Number(saved.minMinutes);
        return {
            query: typeof saved.query === "string" ? saved.query.slice(0, 150) : "",
            minMinutes: Number.isInteger(minutes) && minutes >= 1 && minutes <= 600
                ? minutes : defaults.minMinutes,
            resultLimit: saved.resultLimit === 20 ? 20 : 10,
            period: normalizeSearchPeriod(saved.period),
            searchDepth: normalizeSearchDepth(saved.searchDepth)
        };
    } catch (error) {
        return defaults;
    }
}

function saveSearchPreferences() {
    localStorage.setItem(SEARCH_PREFS_KEY, JSON.stringify(searchPreferences));
}

/* =========================================
   SAVED SEARCHES
   Each saved item stores search words, minimum minutes, result count and period.
   Only the preferences are saved. Running a search is always manual.
   ========================================= */



function readSearchForm() {
    const query = document.getElementById("youtube-search-query")?.value.trim() || "";
    const minutes = Number(document.getElementById("youtube-search-minutes")?.value);
    const limit = Number(document.getElementById("youtube-search-limit")?.value);
    const period = normalizeSearchPeriod(document.getElementById("youtube-search-period")?.value);
    const searchDepth = normalizeSearchDepth(document.getElementById("youtube-search-depth")?.value);
    if (!query || !Number.isInteger(minutes) || minutes < 1 || minutes > 600) {
        alert("Enter search words and a minimum duration of 1–600 minutes.");
        return null;
    }
    return {
        query: query.slice(0, 150),
        minMinutes: minutes,
        resultLimit: limit === 20 ? 20 : 10,
        period,
        searchDepth
    };
}

function handleSaveSearch() {
    if (!canModifyLibrary()) return;
    if (searchInProgress) return;
    const preferences = readSearchForm();
    if (!preferences) return;

    const duplicate = savedSearches.some(item =>
        item.id !== editingSavedSearchId &&
        item.query.toLocaleLowerCase() === preferences.query.toLocaleLowerCase() &&
        item.minMinutes === preferences.minMinutes &&
        item.resultLimit === preferences.resultLimit &&
        normalizeSearchPeriod(item.period) === preferences.period &&
        normalizeSearchDepth(item.searchDepth) === preferences.searchDepth
    );
    if (duplicate) {
        alert("This search is already saved.");
        return;
    }

    if (editingSavedSearchId) {
        const index = savedSearches.findIndex(item => item.id === editingSavedSearchId);
        if (index < 0) {
            alert("This saved search no longer exists.");
            handleCancelEditSavedSearch();
            return;
        }
        // Preserve the saved item's ID (important for backups and its Run button).
        savedSearches[index] = { ...savedSearches[index], ...preferences };
        searchResultMessage = "Saved search updated. Tap Run to get fresh results.";
    } else {
        savedSearches.unshift({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            ...preferences
        });
        searchResultMessage = "Search saved. Tap Run to search for the latest videos.";
    }

    saveSavedSearches();
    searchPreferences = preferences;
    saveSearchPreferences();
    editingSavedSearchId = null;
    searchPreferencesBeforeEdit = null;
    if (currentPage === "search") updateContent();
}

function handleEditSavedSearch(id) {
    if (searchInProgress) return;
    const saved = savedSearches.find(item => item.id === id);
    if (!saved) return;

    // Editing only changes the form until Save changes is pressed.
    if (!editingSavedSearchId) {
        searchPreferencesBeforeEdit = { ...searchPreferences };
    }
    editingSavedSearchId = id;
    searchPreferences = {
        query: saved.query,
        minMinutes: saved.minMinutes,
        resultLimit: saved.resultLimit,
        period: normalizeSearchPeriod(saved.period),
        searchDepth: normalizeSearchDepth(saved.searchDepth)
    };
    searchResultMessage = "Edit the fields above, then tap Save changes (or Cancel edit).";
    if (currentPage === "search") {
        updateContent();
        document.getElementById("youtube-search-query")?.focus();
    }
}

function handleCancelEditSavedSearch() {
    if (!editingSavedSearchId) return;
    editingSavedSearchId = null;
    if (searchPreferencesBeforeEdit) {
        searchPreferences = searchPreferencesBeforeEdit;
    }
    searchPreferencesBeforeEdit = null;
    searchResultMessage = "Editing cancelled. Your saved search was not changed.";
    if (currentPage === "search") updateContent();
}

function handleDeleteSavedSearch(id) {
    if (searchInProgress) return;
    const target = savedSearches.find(item => item.id === id);
    if (!target) return;
    if (!confirm(`Remove saved search "${target.query}"?`)) return;
    savedSearches = savedSearches.filter(item => item.id !== id);
    saveSavedSearches();
    if (editingSavedSearchId === id) {
        editingSavedSearchId = null;
        if (searchPreferencesBeforeEdit) searchPreferences = searchPreferencesBeforeEdit;
        searchPreferencesBeforeEdit = null;
    }
    if (currentPage === "search") updateContent();
}

function handleRunSavedSearch(id) {
    if (searchInProgress) return;
    const saved = savedSearches.find(item => item.id === id);
    if (!saved) return;
    editingSavedSearchId = null;
    searchPreferencesBeforeEdit = null;
    runYouTubeSearch({
        query: saved.query,
        minMinutes: saved.minMinutes,
        resultLimit: saved.resultLimit,
        period: normalizeSearchPeriod(saved.period),
        searchDepth: normalizeSearchDepth(saved.searchDepth)
    });
}

/* =========================================
   SETTINGS
   ========================================= */

function openSettings() {
    closeSettings();

    const modal = document.createElement("div");
    modal.className = "settings-overlay";
    modal.id = "settings-overlay";

    const apiKeySaved = Boolean(getApiKey());
    // This is a local overview. It never calls YouTube or modifies saved data.
    const newCount = videos.filter(video => !video.hidden && video.isNew && !video.watched).length;
    const cacheCount = searchCache.filter(item => isValidSearchCacheEntry(item)).length;
    const lastRefresh = getLastRefreshText() || "No successful refresh recorded";

    modal.innerHTML = `
        <div class="settings-modal settings-hub" role="dialog" aria-modal="true"
             aria-labelledby="settings-hub-title" tabindex="-1">
            <div class="settings-header">
                <div>
                    <h2 id="settings-hub-title">Settings</h2>
                    <p>Manage My YouTube in one place</p>
                </div>
                <button class="settings-close-button" id="close-settings-button"
                        type="button" aria-label="Close settings">×</button>
            </div>

            <div class="settings-hub-body">
                <section class="settings-overview" aria-label="Your library at a glance">
                    <div><strong>${channels.length}</strong><span>Channels</span></div>
                    <div><strong>${videos.length}</strong><span>Videos</span></div>
                    <div><strong>${savedSearches.length}</strong><span>Searches</span></div>
                    <div><strong>${newCount}</strong><span>New</span></div>
                </section>

                <details class="settings-group" open>
                    <summary><span>🔗 Connection &amp; Refresh</span><span class="settings-group-arrow" aria-hidden="true">⌄</span></summary>
                    <div class="settings-group-content">
                        <div class="settings-status ${apiKeySaved ? "settings-status-ok" : "settings-status-warning"}">
                            ${apiKeySaved ? "✓ API key saved on this device" : "⚠ No API key saved"}
                        </div>
                        <div class="settings-button-grid">
                            <button class="settings-action-button" id="change-api-key-button"
                                    type="button">Change API key</button>
                            ${apiKeySaved ? `<button class="settings-danger-button"
                                    id="remove-api-key-button" type="button">Remove API key</button>` : ""}
                        </div>
                        <p class="settings-description"><strong>${channels.length}</strong> followed
                            channel${channels.length === 1 ? "" : "s"}.</p>
                        <p class="settings-description">${escapeHtml(lastRefresh)}</p>
                        <p class="settings-description">Automatic refresh: every 60 minutes while Chrome
                            keeps this page running. Background or closed tabs may pause it.</p>
                        <button class="settings-action-button" id="settings-open-channels-button"
                                type="button">View Channels</button>
                    </div>
                </details>

                <details class="settings-group">
                    <summary><span>📊 API Usage</span><span class="settings-group-arrow" aria-hidden="true">⌄</span></summary>
                    <div class="settings-group-content">
                        <p class="settings-description">Local request counts from this Chrome only;
                            not the official Google Cloud quota.</p>
                        ${apiUsageHtml()}
                    </div>
                </details>

                <details class="settings-group" id="settings-hidden-group">
                    <summary><span>🙈 Hidden videos (<span id="settings-hidden-count">${videos.filter(video => video.hidden).length}</span>)</span><span class="settings-group-arrow" aria-hidden="true">⌄</span></summary>
                    <div class="settings-group-content">
                        <p class="settings-description">Hidden videos stay in your library and backup, but are
                            not shown in Home, Search, New, Saved, Watched or Channels.
                            Use Restore to show them again.</p>
                        <div id="settings-hidden-list" class="settings-hidden-list"></div>
                    </div>
                </details>

                <details class="settings-group">
                    <summary><span>💾 Backup &amp; Storage</span><span class="settings-group-arrow" aria-hidden="true">⌄</span></summary>
                    <div class="settings-group-content">
                        <h3>Backup &amp; Restore</h3>
                        <p class="settings-description">Save your channels, saved searches and video
                            statuses (NEW, Watched, Saved, Downloaded and Hidden) to a JSON file.</p>
                        <label class="settings-backup-option">
                            <input type="checkbox" id="backup-include-api-key">
                            <span>Include API key <small>(sensitive; off by default)</small></span>
                        </label>
                        <button class="settings-action-button" id="download-backup-button"
                                type="button">↓ Download backup (.json)</button>
                        <button class="settings-action-button" id="restore-backup-button"
                                type="button">↑ Restore from backup</button>
                        <input type="file" id="restore-backup-file" accept=".json,application/json"
                               style="display:none;" aria-label="Select backup JSON file">
                        <p class="settings-description">Restore replaces data on this device after
                            confirmation. Download a current backup before restoring.</p>
                        <hr class="settings-hub-divider">
                        <h3>Temporary search cache</h3>
                        <p class="settings-description">${cacheCount} cached search${cacheCount === 1 ? "" : "es"}
                            (up to 10 minutes). Clearing these does <strong>not</strong> remove
                            Saved searches, videos or Watched statuses.</p>
                        <button class="settings-action-button" id="clear-search-cache-button"
                                type="button" ${cacheCount === 0 ? "disabled" : ""}>
                            Clear search cache
                        </button>
                    </div>
                </details>
                <p class="settings-hub-note">All library data is stored locally in this browser.
                    Keep a backup before clearing Chrome site data or changing phones.</p>
            </div>

            <div class="settings-footer">
                <button class="form-button form-cancel-button"
                        id="close-settings-footer-button" type="button">Close</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    modal.querySelector(".settings-modal")?.focus();
    renderHiddenVideosInSettings();
    document.getElementById("settings-hidden-list")?.addEventListener("click", handleHiddenVideoRestore);

    document.getElementById("close-settings-button")
        ?.addEventListener("click", closeSettings);
    document.getElementById("close-settings-footer-button")
        ?.addEventListener("click", closeSettings);
    document.getElementById("change-api-key-button")
        ?.addEventListener("click", showChangeApiKeyForm);
    document.getElementById("remove-api-key-button")
        ?.addEventListener("click", removeStoredApiKey);
    document.getElementById("settings-open-channels-button")
        ?.addEventListener("click", () => {
            closeSettings();
            navigateToPage("channels");
        });
    document.getElementById("download-backup-button")
        ?.addEventListener("click", downloadMyYouTubeBackup);
    document.getElementById("restore-backup-button")
        ?.addEventListener("click", () =>
            document.getElementById("restore-backup-file")?.click());
    document.getElementById("restore-backup-file")
        ?.addEventListener("change", handleMyYouTubeRestore);
    document.getElementById("clear-search-cache-button")
        ?.addEventListener("click", () => {
            if (!confirm("Clear temporary search results? Saved searches and videos will not be deleted.")) return;
            clearSearchCache();
            // Reopen the same group so the confirmation stays visible on a phone.
            openSettings();
            const groups = document.querySelectorAll("#settings-overlay .settings-group");
            if (groups[0]) groups[0].open = false;
            const backupGroup = [...groups].find(group => group.querySelector("#clear-search-cache-button"));
            if (backupGroup) backupGroup.open = true;
        });
    modal.addEventListener("click", event => {
        if (event.target === modal) closeSettings();
    });
    modal.addEventListener("keydown", event => {
        if (event.key === "Escape") closeSettings();
    });
}

// Hidden entries are stored with their original status. Nothing is permanently deleted.
function renderHiddenVideosInSettings() {
    const list = document.getElementById("settings-hidden-list");
    const count = document.getElementById("settings-hidden-count");
    if (!list) return;
    const hiddenVideos = videos.filter(video => video.hidden);
    if (count) count.textContent = String(hiddenVideos.length);
    list.innerHTML = hiddenVideos.length ? hiddenVideos.map(video => `
        <div class="settings-hidden-item">
            <div class="settings-hidden-info">
                <strong>${escapeHtml(video.title || "Untitled video")}</strong>
                <span>${escapeHtml(video.channel || "Unknown channel")}</span>
            </div>
            <button type="button" class="settings-action-button settings-restore-video"
                data-restore-video-id="${escapeHtml(video.id)}"
                aria-label="Restore ${escapeHtml(video.title || "video")}">↺ Restore</button>
        </div>
    `).join("") : `<p class="settings-description">No hidden videos. Videos you hide will appear here.</p>`;
}

function handleHiddenVideoRestore(event) {
    if (!canModifyLibrary()) return;
    const button = event.target.closest("[data-restore-video-id]");
    if (!button) return;
    const video = videos.find(item => item.id === button.dataset.restoreVideoId);
    if (!video || !video.hidden) return;
    video.hidden = false;
    saveVideos();
    renderHiddenVideosInSettings();
    updateContent();
}

function closeSettings() {
    document.getElementById("settings-overlay")?.remove();
}

function showChangeApiKeyForm() {
    const modal = document.getElementById("settings-overlay");
    if (!modal) return;

    const currentKey = getApiKey();

    modal.querySelector(".settings-modal").innerHTML = `
        <div class="settings-header">
            <div>
                <h2>Change API key</h2>
                <p>Enter your new YouTube API key.</p>
            </div>

            <button class="settings-close-button"
                    id="close-settings-button"
                    type="button"
                    aria-label="Close settings">×</button>
        </div>

        <div class="settings-section">
            <label class="settings-input-label">
                YouTube API key

                <input type="password"
                       id="new-api-key-input"
                       value="${escapeHtml(currentKey)}"
                       placeholder="Paste API key"
                       autocomplete="off">
            </label>

            <p class="settings-description">
                The key is stored locally in this browser on this device.
            </p>
        </div>

        <div class="settings-footer">
            <button class="form-button form-save-button"
                    id="save-new-api-key-button"
                    type="button">
                Save API key
            </button>

            <button class="form-button form-cancel-button"
                    id="cancel-api-key-button"
                    type="button">
                Cancel
            </button>
        </div>
    `;

    document
        .getElementById("close-settings-button")
        ?.addEventListener("click", closeSettings);

    document
        .getElementById("cancel-api-key-button")
        ?.addEventListener("click", openSettings);

    document
        .getElementById("save-new-api-key-button")
        ?.addEventListener("click", saveNewApiKey);
}

function saveNewApiKey() {
    const input = document.getElementById("new-api-key-input");
    if (!input) return;

    const newKey = input.value.trim();

    if (!newKey) {
        alert("Please enter an API key.");
        return;
    }

    saveApiKey(newKey);
    alert("API key saved.");
    openSettings();
}

function removeStoredApiKey() {
    if (!confirm("Remove the saved YouTube API key from this device?")) {
        return;
    }

    removeApiKey();
    alert("API key removed.");
    openSettings();
}

/* Backup & Restore functions are provided by backup-manager.js. */

/* =========================================
   WATCH QUEUE + IMPORT BY LINK
   Ordered videos already in the library. No YouTube account sign-in needed.
   ========================================= */

function isQueued(videoId) {
    return watchQueue.includes(videoId);
}


// Update the library and queue together, rolling back both localStorage keys on error.
function commitWatchQueue(nextIds, nextVideos = videos) {
    ensureLibraryWritable();
    if (!Array.isArray(nextIds) || nextIds.length > WATCH_QUEUE_LIMIT ||
        new Set(nextIds).size !== nextIds.length) throw new Error("Invalid queue contents.");
    const ids = new Set(nextVideos.filter(video => !video.hidden).map(video => video.id));
    if (nextIds.some(id => !ids.has(id))) throw new Error("A queued video is not in the library.");
    const oldVideoStorage = localStorage.getItem(VIDEO_STORAGE_KEY);
    const oldQueueStorage = localStorage.getItem(WATCH_QUEUE_KEY);
    try {
        localStorage.setItem(VIDEO_STORAGE_KEY, JSON.stringify(nextVideos));
        localStorage.setItem(WATCH_QUEUE_KEY, JSON.stringify(nextIds));
    } catch (error) {
        try {
            if (oldVideoStorage === null) localStorage.removeItem(VIDEO_STORAGE_KEY);
            else localStorage.setItem(VIDEO_STORAGE_KEY, oldVideoStorage);
            if (oldQueueStorage === null) localStorage.removeItem(WATCH_QUEUE_KEY);
            else localStorage.setItem(WATCH_QUEUE_KEY, oldQueueStorage);
        } catch (rollbackError) {
            console.error("Could not roll back Watch Queue storage", rollbackError);
        }
        throw error;
    }
    videos = nextVideos;
    watchQueue = nextIds;
    sortVideos();
}

function toggleWatchQueue(videoId) {
    if (!canModifyLibrary()) return;
    const stored = videos.find(video => video.id === videoId);
    const searched = searchResults.find(video => video.id === videoId);
    const video = stored || searched;
    if (!video || video.hidden || !getYouTubeVideoLink(videoId)) return;
    const next = isQueued(videoId)
        ? watchQueue.filter(id => id !== videoId)
        : [...watchQueue, videoId];
    const nextVideos = stored ? videos : [...videos, { ...searched, isNew: false }];
    try {
        commitWatchQueue(next, nextVideos);
        queueMessage = isQueued(videoId) ? "Added to Watch Queue." : "Removed from Watch Queue.";
        updateContent();
    } catch (error) {
        console.error("Cannot update Watch Queue", error);
        alert(error.message === "Invalid queue contents."
            ? `Watch Queue can hold up to ${WATCH_QUEUE_LIMIT} videos.`
            : "Could not save the queue. Check Chrome storage and try again.");
    }
}

function moveQueueVideo(videoId, direction) {
    if (!canModifyLibrary()) return;
    const from = watchQueue.indexOf(videoId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= watchQueue.length) return;
    const next = [...watchQueue];
    [next[from], next[to]] = [next[to], next[from]];
    try {
        commitWatchQueue(next);
        renderQueuePage();
    } catch (error) { alert("Could not save the new order."); }
}

function finishQueueVideo(videoId) {
    if (!canModifyLibrary()) return;
    const video = videos.find(item => item.id === videoId);
    if (!video || !isQueued(videoId)) return;
    const nextVideos = videos.map(item => item.id === videoId
        ? { ...item, watched: true, isNew: false } : item);
    try {
        commitWatchQueue(watchQueue.filter(id => id !== videoId), nextVideos);
        queueMessage = "Marked as watched and removed from queue.";
        renderQueuePage();
        updateNewVideoCount();
    } catch (error) { alert("Could not update this video. Please try again."); }
}

// Accept only recognised YouTube hostnames, not arbitrary websites with a v parameter.
// parseYouTubeVideoId is provided by youtube-utils.js (loaded before app.js).

function renderQueuePage() {
    const videoList = document.querySelector(".video-list");
    const title = document.querySelector(".section-header h2");
    if (!videoList || !title) return;
    title.textContent = "Watch Queue";
    document.getElementById("refresh-page-button")?.remove();
    const items = watchQueue.map(id => videos.find(video => video.id === id))
        .filter(video => video && !video.hidden);
    videoList.innerHTML = `
        <section class="queue-hero" aria-label="Your watch queue">
            <span class="home-eyebrow">MY YOUTUBE · WATCH QUEUE</span>
            <h3>Watch what matters next.</h3>
            <p>${items.length} video${items.length === 1 ? "" : "s"} in your personal watch order. Use ↑ and ↓ to rearrange.</p>
            <button type="button" class="queue-return" id="queue-back-home">← Back to Home</button>
        </section>
        <section class="queue-import" aria-label="Import a YouTube video">
            <h3>＋ Import by YouTube link</h3>
            <p>Paste a normal YouTube, youtu.be, Shorts or Live video link. Existing library videos need no API request.</p>
            <form id="queue-import-form">
                <label for="queue-import-url">YouTube video link</label>
                <input id="queue-import-url" type="text" required inputmode="url"
                    autocomplete="off" placeholder="https://www.youtube.com/watch?v=..."
                    aria-describedby="queue-import-hint" ${queueImportInProgress ? "disabled" : ""}>
                <button type="submit" ${queueImportInProgress ? "disabled" : ""}>${queueImportInProgress ? "Adding..." : "＋ Add to Queue"}</button>
            </form>
            <p id="queue-import-hint" class="queue-hint">New videos need your existing YouTube API key in Settings. They are not automatically marked NEW, Saved or Watched.</p>
            <p class="queue-feedback" role="status" aria-live="polite">${escapeHtml(queueMessage)}</p>
        </section>
        <section class="queue-list-section" aria-labelledby="queue-list-title">
            <div class="home-section-title"><h3 id="queue-list-title">Your queue <span class="home-mini-count">${items.length}</span></h3></div>
            ${items.length ? items.map((video, index) => `
                <div class="queue-entry" data-queue-id="${escapeHtml(video.id)}">
                    <div class="queue-entry-toolbar">
                        <span class="queue-position">#${index + 1}</span>
                        <div class="queue-entry-actions">
                            <button type="button" data-queue-operation="up" ${index === 0 ? "disabled" : ""} aria-label="Move ${escapeHtml(video.title)} up">↑ Up</button>
                            <button type="button" data-queue-operation="down" ${index === items.length - 1 ? "disabled" : ""} aria-label="Move ${escapeHtml(video.title)} down">↓ Down</button>
                            <button type="button" data-queue-operation="done" class="queue-done" aria-label="Mark ${escapeHtml(video.title)} watched and remove from queue">✓ Done</button>
                            <button type="button" data-queue-operation="remove" aria-label="Remove ${escapeHtml(video.title)} from queue">Remove</button>
                        </div>
                    </div>
                    ${createVideoCard(video)}
                </div>`).join("")
                : '<p class="queue-empty">Your queue is empty. Add videos using the Queue button under any video, or import a link above.</p>'}
        </section>`;
    document.getElementById("queue-back-home")?.addEventListener("click", () => navigateToPage("home"));
    document.getElementById("queue-import-form")?.addEventListener("submit", handleQueueImport);
    videoList.querySelectorAll(".queue-entry [data-queue-operation]").forEach(button => {
        button.addEventListener("click", () => {
            const id = button.closest("[data-queue-id]")?.dataset.queueId;
            if (!id) return;
            switch (button.dataset.queueOperation) {
                case "up": moveQueueVideo(id, -1); break;
                case "down": moveQueueVideo(id, 1); break;
                case "done": finishQueueVideo(id); break;
                case "remove": toggleWatchQueue(id); break;
            }
        });
    });
    setupVideoButtons();
    updateNewVideoCount();
}

async function handleQueueImport(event) {
    if (!canModifyLibrary()) return;
    event.preventDefault();
    if (queueImportInProgress) return;
    const input = document.getElementById("queue-import-url");
    const text = input?.value?.trim() || "";
    const id = parseYouTubeVideoId(text);
    const feedback = document.querySelector(".queue-feedback");
    if (!id) {
        if (feedback) feedback.textContent = "Please enter a valid YouTube video link.";
        return;
    }
    if (isQueued(id)) {
        if (feedback) feedback.textContent = "This video is already in your Watch Queue.";
        return;
    }
    if (watchQueue.length >= WATCH_QUEUE_LIMIT) {
        if (feedback) feedback.textContent = "Your queue is full (500 videos).";
        return;
    }
    const stored = videos.find(video => video.id === id);
    if (stored?.hidden) {
        if (feedback) feedback.textContent = "This video is hidden. Restore it first in Settings → Hidden videos.";
        return;
    }
    if (stored) {
        toggleWatchQueue(id);
        queueMessage = "Added existing video to your queue — no API request used.";
        if (currentPage === "queue") renderQueuePage();
        return;
    }
    // A video from the current Search results has metadata already, so don't fetch again.
    const searched = searchResults.find(video => video.id === id);
    if (searched) {
        toggleWatchQueue(id);
        queueMessage = "Added video from Search — no extra API request used.";
        if (currentPage === "queue") renderQueuePage();
        return;
    }
    if (!getApiKey()) {
        if (feedback) feedback.textContent = "You need a YouTube API key in Settings to import a new video.";
        return;
    }
    queueImportInProgress = true;
    const button = document.querySelector('#queue-import-form button[type="submit"]');
    if (button) { button.disabled = true; button.textContent = "Adding..."; }
    if (feedback) feedback.textContent = "Loading video details from YouTube...";
    try {
        const result = await youtubeApiRequest("videos", { part: "snippet,contentDetails", id });
        const item = (result.items || []).find(entry => entry.id === id);
        if (!item || !item.snippet) throw new Error("VIDEO_NOT_FOUND");
        const video = createVideoObject({
            id,
            title: item.snippet.title || "Untitled video",
            channel: item.snippet.channelTitle || "Unknown channel",
            channelId: item.snippet.channelId || "",
            publishedAt: item.snippet.publishedAt || "",
            duration: formatDuration(item.contentDetails?.duration),
            thumbnail: item.snippet.thumbnails?.high?.url ||
                item.snippet.thumbnails?.medium?.url ||
                item.snippet.thumbnails?.default?.url || ""
        });
        video.isNew = false;
        commitWatchQueue([...watchQueue, id], [...videos, video]);
        queueMessage = "Video imported and added to your Watch Queue.";
    } catch (error) {
        console.error("Watch Queue import failed", error);
        const message = error.message;
        queueMessage = message === "VIDEO_NOT_FOUND"
            ? "Video unavailable. Check its link or privacy settings."
            : ["quotaExceeded", "rateLimitExceeded"].includes(message)
                ? "YouTube API quota reached. Try again after the quota resets."
                : ["keyInvalid", "forbidden", "NO_API_KEY"].includes(message)
                    ? "YouTube rejected the API key. Check Settings and Google Cloud restrictions."
                    : "Could not import this video. Check your connection and try again.";
    } finally {
        queueImportInProgress = false;
        if (currentPage === "queue") renderQueuePage();
    }
}


/* =========================================
   SMART FEED — filtered stored videos from followed channels.
   No new API calls; Refresh uses the existing refreshAllChannels function.
   ========================================= */
function smartFeedRule(channelId) {
    return smartFeedPrefs.rules[channelId] || { enabled: true, minMinutes: 0 };
}
function smartFeedSourceVideos() {
    const following = new Set(channels.map(channel => channel.id));
    return videos.filter(video => !video.hidden && following.has(video.channelId));
}
function getSmartFeedVideos() {
    const prefs = smartFeedPrefs;
    const query = prefs.query.trim().toLocaleLowerCase();
    const matching = smartFeedSourceVideos().filter(video => {
        if (prefs.channelId && video.channelId !== prefs.channelId) return false;
        const rule = smartFeedRule(video.channelId);
        if (!rule.enabled) return false;
        if (query && !`${video.title || ""} ${video.channel || ""}`.toLocaleLowerCase().includes(query)) return false;
        const minimum = Math.max(prefs.minMinutes, rule.minMinutes);
        if (minimum > 0) {
            const seconds = durationSecondsForSorting(video.duration);
            if (seconds === null || seconds < minimum * 60) return false;
        }
        if (prefs.status === "unwatched") return !video.watched;
        if (prefs.status === "new") return video.isNew && !video.watched;
        if (prefs.status === "saved") return video.saved;
        if (prefs.status === "watched") return video.watched;
        return true;
    });
    return getSortedSearchResults(matching, prefs.sort);
}
function updateSmartFeedResults() {
    const results = document.getElementById("smart-feed-results");
    const counter = document.getElementById("smart-feed-summary");
    if (!results || !counter) return;
    const found = getSmartFeedVideos();
    const total = smartFeedSourceVideos().length;
    counter.textContent = `Showing ${found.length} of ${total} stored videos from followed channels`;
    results.innerHTML = found.length
        ? found.map(video => createVideoCard(video)).join("")
        : `<div class="empty-state"><h3>No matching videos</h3>
             <p>Try All videos, reduce the minimum duration, or change your channel settings.
                If a channel has no stored videos, use Refresh channels.</p></div>`;
    setupVideoButtons();
    updateNewVideoCount();
}
function renderSmartFeedPage() {
    const list = document.querySelector(".video-list");
    const title = document.querySelector(".section-header h2");
    if (!list || !title) return;
    title.textContent = "Smart Feed";
    document.getElementById("refresh-page-button")?.remove();
    if (smartFeedPrefs.channelId && !channels.some(c => c.id === smartFeedPrefs.channelId)) {
        smartFeedPrefs.channelId = "";
        saveSmartFeedPrefs();
    }
    const rules = channels.map(channel => {
        const rule = smartFeedRule(channel.id);
        const total = smartFeedSourceVideos().filter(video => video.channelId === channel.id).length;
        return `<div class="smart-feed-rule" data-feed-channel-id="${escapeHtml(channel.id)}">
            <div class="smart-feed-rule-main">
                <label class="smart-feed-rule-enabled">
                    <input type="checkbox" data-feed-rule="enabled" ${rule.enabled ? "checked" : ""}>
                    <span>${escapeHtml(channel.name)}</span>
                </label>
                <span class="smart-feed-rule-count">${total} videos</span>
            </div>
            <label class="smart-feed-rule-duration">Minimum minutes for this channel
                <input type="number" data-feed-rule="minMinutes" inputmode="numeric" min="0" max="600"
                    step="1" value="${rule.minMinutes}">
            </label>
        </div>`;
    }).join("");
    const allStored = smartFeedSourceVideos();
    const newCount = allStored.filter(video => video.isNew && !video.watched).length;
    const unwatched = allStored.filter(video => !video.watched).length;
    list.innerHTML = `
        <section class="smart-feed-hero">
            <div class="home-eyebrow">MY YOUTUBE · SMART FEED</div>
            <h3>Everything from your channels.</h3>
            <p>One feed for your followed channels. Only videos already stored in My YouTube are shown.</p>
            <div class="smart-feed-pills">
                <span>${channels.length} channels</span><span>${newCount} new</span>
                <span>${unwatched} not watched</span>
            </div>
            <div class="smart-feed-shortcuts">
                <button type="button" id="smart-feed-home">← Home</button>
                <button type="button" id="smart-feed-channels">Channels</button>
                <button type="button" id="smart-feed-refresh" ${refreshInProgress || !channels.length ? "disabled" : ""}>
                    ${refreshInProgress ? "Refreshing…" : "↻ Refresh channels"}
                </button>
            </div>
        </section>
        <section class="smart-feed-controls" aria-label="Smart Feed filters">
            <h3>Customize your feed</h3>
            <p class="smart-feed-hint">Filters are saved in this Chrome browser. No extra API requests are used.</p>
            <label for="smart-feed-query">Find a video
                <input id="smart-feed-query" type="search" maxlength="150" autocomplete="off"
                    placeholder="Video title or channel" value="${escapeHtml(smartFeedPrefs.query)}">
            </label>
            <div class="smart-feed-grid">
                <label for="smart-feed-channel">Channel
                    <select id="smart-feed-channel"><option value="">All followed channels</option>
                        ${channels.map(c => `<option value="${escapeHtml(c.id)}" ${smartFeedPrefs.channelId === c.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}
                    </select>
                </label>
                <label for="smart-feed-status">Show
                    <select id="smart-feed-status">
                        ${[["unwatched","Not watched"],["new","New only"],["all","All videos"],["saved","Saved"],["watched","Watched"]]
                            .map(([id,label]) => `<option value="${id}" ${smartFeedPrefs.status === id ? "selected" : ""}>${label}</option>`).join("")}
                    </select>
                </label>
                <label for="smart-feed-minimum">Minimum minutes (all channels)
                    <input id="smart-feed-minimum" type="number" inputmode="numeric" min="0" max="600"
                        step="1" value="${smartFeedPrefs.minMinutes}">
                </label>
                <label for="smart-feed-sort">Order
                    <select id="smart-feed-sort">
                        ${[["newest","Newest first"],["oldest","Oldest first"],["longest","Longest first"],["shortest","Shortest first"]]
                            .map(([id,label]) => `<option value="${id}" ${smartFeedPrefs.sort === id ? "selected" : ""}>${label}</option>`).join("")}
                    </select>
                </label>
            </div>
            <div class="smart-feed-control-actions">
                <button type="button" id="smart-feed-reset">Reset filters</button>
                <button type="button" id="smart-feed-queue">▶ Watch Queue</button>
            </div>
            <details id="smart-feed-rules" ${smartFeedRulesOpen ? "open" : ""}>
                <summary>⚙ Channel preferences</summary>
                <p class="smart-feed-hint">Choose which channels appear and their own minimum durations.
                   The stricter minimum applies. Set 0 to allow any duration.</p>
                ${rules || '<p class="smart-feed-hint">Follow a channel to set individual preferences.</p>'}
            </details>
        </section>
        <section class="smart-feed-results-section" aria-label="Smart Feed videos">
            <div class="home-section-title"><h3>Videos</h3>
                <span class="home-mini-count" id="smart-feed-summary" role="status" aria-live="polite"></span>
            </div>
            <div id="smart-feed-results" class="smart-feed-results"></div>
        </section>`;
    document.getElementById("smart-feed-home")?.addEventListener("click", () => navigateToPage("home"));
    document.getElementById("smart-feed-channels")?.addEventListener("click", () => navigateToPage("channels"));
    document.getElementById("smart-feed-queue")?.addEventListener("click", () => navigateToPage("queue"));
    document.getElementById("smart-feed-refresh")?.addEventListener("click", () => refreshAllChannels(false));
    const rulesBox = document.getElementById("smart-feed-rules");
    rulesBox?.addEventListener("toggle", () => { smartFeedRulesOpen = rulesBox.open; });
    const updateField = (elementId, prop, convert = value => value) => {
        const input = document.getElementById(elementId);
        input?.addEventListener(prop === "query" ? "input" : "change", () => {
            const next = convert(input.value);
            if (next === null) { input.value = String(smartFeedPrefs[prop]); return; }
            smartFeedPrefs[prop] = next;
            saveSmartFeedPrefs();
            updateSmartFeedResults();
        });
    };
    const parseMinutes = value => {
        const text = String(value).trim();
        if (!/^\d+$/.test(text)) return null;
        const number = Number(text);
        return Number.isInteger(number) && number >= 0 && number <= 600 ? number : null;
    };
    updateField("smart-feed-query", "query", value => value.slice(0,150));
    updateField("smart-feed-channel", "channelId");
    updateField("smart-feed-status", "status");
    updateField("smart-feed-sort", "sort");
    updateField("smart-feed-minimum", "minMinutes", parseMinutes);
    document.getElementById("smart-feed-reset")?.addEventListener("click", () => {
        smartFeedPrefs = { ...smartFeedPrefs, channelId: "", query: "", minMinutes: 0,
            status: "unwatched", sort: "newest" };
        saveSmartFeedPrefs();
        renderSmartFeedPage();
    });
    list.querySelectorAll("[data-feed-channel-id]").forEach(row => {
        const id = row.dataset.feedChannelId;
        const checkbox = row.querySelector('[data-feed-rule="enabled"]');
        const input = row.querySelector('[data-feed-rule="minMinutes"]');
        checkbox?.addEventListener("change", () => {
            smartFeedPrefs.rules[id] = { ...smartFeedRule(id), enabled: checkbox.checked };
            saveSmartFeedPrefs(); updateSmartFeedResults();
        });
        input?.addEventListener("change", () => {
            const min = parseMinutes(input.value);
            if (min === null) { input.value = smartFeedRule(id).minMinutes; return; }
            smartFeedPrefs.rules[id] = { ...smartFeedRule(id), minMinutes: min };
            saveSmartFeedPrefs(); updateSmartFeedResults();
        });
    });
    updateSmartFeedResults();
}

/* =========================================
   VIDEO FILTERING
   ========================================= */

function getVisibleVideos() {
    if (currentPage === "new") {
        return videos.filter(video => !video.hidden && video.isNew && !video.watched);
    }

    if (currentPage === "saved") {
        return videos.filter(video => !video.hidden && video.saved);
    }

    if (currentPage === "watched") {
        return videos.filter(video => !video.hidden && video.watched);
    }

    return [];
}

/* =========================================
   SORTING
   ========================================= */

function sortVideos() {
    videos.sort((first, second) => {
        const firstTime = new Date(
            first.publishedAt || first.date || 0
        ).getTime();

        const secondTime = new Date(
            second.publishedAt || second.date || 0
        ).getTime();

        return secondTime - firstTime;
    });
}

/* =========================================
   HOME DASHBOARD
   A useful overview of every existing section, without new API calls.
   All cards use the same video buttons as elsewhere in the app.
   ========================================= */

function createHomeEditorMarkup() {
    if (!homeEditorOpen) return "";
    return `<section class="home-custom-editor" id="home-custom-editor" aria-label="Customize Home sections">
        <p>Choose what appears on Home and move sections up or down. Your videos will not change.</p>
        <div class="home-custom-rows">
            ${homeLayout.order.map((id, position) => `
                <div class="home-custom-row">
                    <span class="home-custom-name">${HOME_SECTION_NAMES[id]}</span>
                    <div class="home-custom-row-actions">
                        <button type="button" data-home-toggle="${id}"
                            aria-pressed="${homeLayout.visible[id]}"
                            aria-label="${homeLayout.visible[id] ? "Hide" : "Show"} ${HOME_SECTION_NAMES[id]}">
                            ${homeLayout.visible[id] ? "✓ Shown" : "Show"}
                        </button>
                        <button type="button" data-home-move="${id}" data-move-step="-1"
                            aria-label="Move ${HOME_SECTION_NAMES[id]} up" ${position === 0 ? "disabled" : ""}>↑</button>
                        <button type="button" data-home-move="${id}" data-move-step="1"
                            aria-label="Move ${HOME_SECTION_NAMES[id]} down"
                            ${position === homeLayout.order.length - 1 ? "disabled" : ""}>↓</button>
                    </div>
                </div>
            `).join("")}
        </div>
        <div class="home-custom-footer">
            <button type="button" id="home-reset-layout">Reset to default</button>
            <button type="button" id="home-done-layout">Done</button>
        </div>
    </section>`;
}
function changeHomeLayout(action, id, step = 0) {
    if (action === "reset") {
        homeLayout = normalizeHomeLayout(null);
    } else if (HOME_SECTION_IDS.includes(id) && action === "toggle") {
        homeLayout.visible[id] = !homeLayout.visible[id];
    } else if (HOME_SECTION_IDS.includes(id) && action === "move") {
        const from = homeLayout.order.indexOf(id);
        const to = from + step;
        if (from < 0 || to < 0 || to >= homeLayout.order.length) return;
        homeLayout.order.splice(from, 1);
        homeLayout.order.splice(to, 0, id);
    } else return;
    saveHomeLayout();
    renderHomePage();
}

function renderHomePage() {
    const videoList = document.querySelector(".video-list");
    const sectionTitle = document.querySelector(".section-header h2");
    if (!videoList || !sectionTitle) return;
    sectionTitle.textContent = "Home";
    document.getElementById("refresh-page-button")?.remove();

    const available = videos.filter(video => !video.hidden);
    const newVideos = available.filter(video => video.isNew && !video.watched);
    const savedVideos = available.filter(video => video.saved);
    const watchedVideos = available.filter(video => video.watched);
    // "Watch next" means saved and not marked watched; no watch progress is inferred.
    const watchNext = savedVideos.filter(video => !video.watched).slice(0, 3);
    const recent = newVideos.length
        ? newVideos.slice(0, 2)
        : available.filter(video => !video.watched &&
            channels.some(channel => channel.id === video.channelId)).slice(0, 2);
    const recentHeading = newVideos.length ? "New uploads" : "Recent channel videos";
    const refreshText = getLastRefreshText() || "Channels have not been refreshed yet";
    const channelHighlights = channels.map(channel => ({
        channel,
        stats: getChannelStats(channel.id)
    })).sort((a, b) => (b.stats.new - a.stats.new) ||
        a.channel.name.localeCompare(b.channel.name)).slice(0, 3);
    const overviewItems = [
        { page: "new", icon: "●", label: "New", count: newVideos.length, description: "Unwatched uploads" },
        { page: "saved", icon: "☆", label: "Saved", count: savedVideos.length, description: "Your video library" },
        { page: "watched", icon: "✓", label: "Watched", count: watchedVideos.length, description: "Marked as watched" },
        { page: "channels", icon: "▣", label: "Channels", count: channels.length, description: "Following" }
    ];

    videoList.innerHTML = `
        <section class="home-hero home-hero-v2" aria-label="Your YouTube overview">
            <div class="home-eyebrow">MY YOUTUBE · HOME</div>
            <h3>Your videos, your way.</h3>
            <p>A quick look at what is new, what you saved and what to watch next.</p>
            <div class="home-status-line"><span class="home-status-dot" aria-hidden="true"></span>
                <span>${escapeHtml(refreshText)}</span></div>
        </section>
        <section class="home-stats home-stats-v2" aria-label="Your video statistics">
            ${overviewItems.map(item => `
                <button class="home-stat home-stat-v2" type="button" data-go-page="${item.page}"
                        aria-label="Open ${item.label}: ${item.count}">
                    <span class="home-stat-top"><span class="home-stat-symbol" aria-hidden="true">${item.icon}</span> ${item.label}</span>
                    <strong>${item.count}</strong>
                    <span class="home-stat-description">${item.description}</span>
                </button>
            `).join("")}
        </section>
        <div class="home-customize-toolbar">
            <span>Make Home your own</span>
            <button type="button" id="home-customize-button" aria-expanded="${homeEditorOpen}"
                aria-controls="home-custom-editor">${homeEditorOpen ? "Close editor" : "⚙ Customize Home"}</button>
        </div>
        ${createHomeEditorMarkup()}
        <section class="home-panel home-action-panel" aria-labelledby="home-actions-title">
            <div class="home-section-title"><h3 id="home-actions-title">Quick actions</h3></div>
            <div class="home-actions home-actions-v2">
                <button type="button" class="home-primary-action" id="home-refresh" ${refreshInProgress || !channels.length ? "disabled" : ""}>
                    ↻ ${refreshInProgress ? "Refreshing..." : "Refresh channels"}
                </button>
                <button type="button" class="home-secondary-action" data-go-page="search">⌕ Search YouTube</button>
                <button type="button" class="home-secondary-action" data-go-page="feed">▣ Smart Feed</button>
                <button type="button" class="home-secondary-action" id="home-settings">⚙ Settings & backup</button>
            </div>
        </section>
        <section class="home-panel smart-feed-home" aria-labelledby="home-feed-title">
            <div class="home-section-title">
                <h3 id="home-feed-title">▣ Smart Feed</h3>
                <button type="button" class="home-text-action" data-go-page="feed">Open Feed →</button>
            </div>
            <p class="home-empty">${channels.length} followed channel${channels.length === 1 ? "" : "s"} ·
                ${available.filter(video => channels.some(channel => channel.id === video.channelId) && !video.watched).length} stored videos not marked watched.</p>
            <p class="home-empty">Find long videos, filter unread uploads and add them to Watch Queue.</p>
        </section>
        <section class="home-panel home-queue-panel" aria-labelledby="home-queue-title">
            <div class="home-section-title">
                <h3 id="home-queue-title">▶ Watch Queue <span class="home-mini-count">${watchQueue.length}</span></h3>
                <button type="button" class="home-text-action" data-go-page="queue">Open Queue →</button>
            </div>
            ${watchQueue.length ? `<p class="home-empty">Up next: <strong>${escapeHtml(videos.find(video => video.id === watchQueue[0])?.title || "Video")}</strong></p>`
                : `<p class="home-empty">Build your own watch order. Add videos or paste a YouTube link.</p>`}
            <button type="button" class="home-secondary-action queue-home-open" data-go-page="queue">＋ Open queue / Import video</button>
        </section>
        <div id="home-custom-section-list" class="home-custom-section-list"></div>
        <section class="home-panel" aria-labelledby="home-next-title">
            <div class="home-section-title">
                <h3 id="home-next-title">Watch next <span class="home-mini-count">${savedVideos.filter(video => !video.watched).length}</span></h3>
                <button type="button" class="home-text-action" data-go-page="saved">View Saved →</button>
            </div>
            ${watchNext.length ? `<div class="home-quick-videos">${watchNext.map(video => {
                const url = getYouTubeVideoLink(video.id);
                const thumbnail = video.thumbnail
                    ? `<img src="${escapeHtml(video.thumbnail)}" alt="" loading="lazy">`
                    : `<span class="home-quick-placeholder" aria-hidden="true">▶</span>`;
                return `<article class="home-quick-video" data-home-video-id="${escapeHtml(video.id)}">
                    <div class="home-quick-thumb">${thumbnail}</div>
                    <div class="home-quick-details">
                        <div class="home-quick-title">${escapeHtml(video.title)}</div>
                        <div class="home-quick-meta">${escapeHtml(video.channel)}${video.duration ? ` · ${escapeHtml(video.duration)}` : ""}</div>
                        ${url ? `<a class="home-inline-action" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"
                            aria-label="Watch ${escapeHtml(video.title)} on YouTube">▶ Watch on YouTube</a>`
                            : `<span class="home-quick-meta">Video link unavailable</span>`}
                        <div class="home-quick-controls" role="group"
                             aria-label="Actions for ${escapeHtml(video.title)}">
                            <button type="button" class="home-quick-action" data-home-video-action="watched"
                                aria-label="Mark ${escapeHtml(video.title)} as watched">✓ Mark watched</button>
                            <button type="button" class="home-quick-action" data-home-video-action="save"
                                aria-label="Remove ${escapeHtml(video.title)} from Saved">☆ Unsave</button>
                            <button type="button" class="home-quick-action" data-home-video-action="copy"
                                aria-label="Copy link for ${escapeHtml(video.title)}" ${url ? "" : "disabled"}>⧉ Copy link</button>
                            <button type="button" class="home-quick-action" data-home-video-action="queue"
                                aria-label="${isQueued(video.id) ? "Remove from" : "Add to"} Watch Queue">
                                ${isQueued(video.id) ? "✓ In queue" : "＋ Queue"}</button>
                        </div>
                    </div>
                </article>`;
            }).join("")}</div>` : `<div class="home-empty-guidance">
                <p class="home-empty">No unwatched saved videos right now.</p>
                <button type="button" class="home-text-action" data-go-page="new">Explore new videos →</button>
            </div>`}
        </section>
        <section class="home-panel" aria-labelledby="home-channels-title">
            <div class="home-section-title">
                <h3 id="home-channels-title">Your channels <span class="home-mini-count">${channels.length}</span></h3>
                <button type="button" class="home-text-action" data-go-page="channels">See all →</button>
            </div>
            ${channelHighlights.length ? `<div class="home-channel-list">${channelHighlights.map(({channel, stats}) => `
                <button type="button" class="home-channel-item" data-open-channel="${escapeHtml(channel.id)}"
                    aria-label="View videos from ${escapeHtml(channel.name)}">
                    ${channel.thumbnail ? `<img src="${escapeHtml(channel.thumbnail)}" alt="" loading="lazy">` : `<span class="home-channel-icon" aria-hidden="true">▣</span>`}
                    <span class="home-channel-text"><strong>${escapeHtml(channel.name)}</strong>
                        <span>${stats.total} stored video${stats.total === 1 ? "" : "s"}</span></span>
                    <span class="home-channel-count${stats.new ? " has-new" : ""}">${stats.new} new</span>
                </button>
            `).join("")}</div>` : `<div class="home-empty-guidance">
                <p class="home-empty">You are not following any channels yet.</p>
                <button type="button" class="home-text-action" data-go-page="channels">Add your first channel →</button>
            </div>`}
        </section>
        <section class="home-panel" aria-labelledby="home-searches-title">
            <div class="home-section-title">
                <h3 id="home-searches-title">Saved searches <span class="home-mini-count">${savedSearches.length}</span></h3>
                <button type="button" class="home-text-action" data-go-page="search">See all →</button>
            </div>
            ${savedSearches.length ? `
                <div class="home-search-list">
                    ${savedSearches.slice(0, 3).map(item => `
                        <button type="button" class="home-search-item" data-run-search="${escapeHtml(item.id)}">
                            <span class="home-search-title">${escapeHtml(item.query)}</span>
                            <span class="home-search-meta">${item.minMinutes}+ min · ${item.resultLimit} videos · ${escapeHtml(searchPeriodLabel(item.period))}</span>
                            <span class="home-search-run">Run →</span>
                        </button>
                    `).join("")}
                </div>
            ` : `<p class="home-empty">Save a search in the Search tab to run it here with one tap.</p>`}
        </section>
        <section class="home-panel" aria-labelledby="home-videos-title">
            <div class="home-section-title">
                <h3 id="home-videos-title">${recentHeading}</h3>
                <button type="button" class="home-text-action" data-go-page="new">See all →</button>
            </div>
            ${recent.length ? `<div class="home-preview-videos">${recent.map(video => createVideoCard(video)).join("")}</div>`
                : `<p class="home-empty">New videos from followed channels will appear here after a successful refresh.</p>`}
        </section>
    `;

    // Move the existing panels into the chosen order; don't recreate their content.
    const customSectionList = videoList.querySelector("#home-custom-section-list");
    const homeSections = {
        watchNext: videoList.querySelector('[aria-labelledby="home-next-title"]'),
        channels: videoList.querySelector('[aria-labelledby="home-channels-title"]'),
        searches: videoList.querySelector('[aria-labelledby="home-searches-title"]'),
        recent: videoList.querySelector('[aria-labelledby="home-videos-title"]')
    };
    homeLayout.order.forEach(id => {
        const panel = homeSections[id];
        if (!panel || !customSectionList) return;
        panel.hidden = !homeLayout.visible[id];
        customSectionList.appendChild(panel);
    });
    document.getElementById("home-customize-button")?.addEventListener("click", () => {
        homeEditorOpen = !homeEditorOpen;
        renderHomePage();
    });
    videoList.querySelectorAll("[data-home-toggle]").forEach(button => {
        button.addEventListener("click", () => changeHomeLayout("toggle", button.dataset.homeToggle));
    });
    videoList.querySelectorAll("[data-home-move]").forEach(button => {
        button.addEventListener("click", () => changeHomeLayout("move", button.dataset.homeMove, Number(button.dataset.moveStep)));
    });
    document.getElementById("home-reset-layout")?.addEventListener("click", () => changeHomeLayout("reset"));
    document.getElementById("home-done-layout")?.addEventListener("click", () => {
        homeEditorOpen = false;
        renderHomePage();
    });
    videoList.querySelectorAll("[data-go-page]").forEach(button => {
        button.addEventListener("click", () => navigateToPage(button.dataset.goPage));
    });
    videoList.querySelectorAll("[data-open-channel]").forEach(button => {
        button.addEventListener("click", () => {
            const id = button.dataset.openChannel;
            if (!channels.some(channel => channel.id === id)) return;
            navigateToPage("channels");
            openChannelVideos(id);
        });
    });
    videoList.querySelectorAll("[data-run-search]").forEach(button => {
        button.addEventListener("click", () => {
            if (searchInProgress) return;
            const id = button.dataset.runSearch;
            navigateToPage("search");
            handleRunSavedSearch(id);
        });
    });
    // Quick actions reuse the existing video state and clipboard functions.
    // Clicking Watched or Unsave refreshes Home and its counters immediately.
    videoList.querySelectorAll(".home-quick-video [data-home-video-action]").forEach(button => {
        button.addEventListener("click", () => {
            const card = button.closest("[data-home-video-id]");
            const videoId = card?.dataset.homeVideoId;
            if (!videoId || !videos.some(video => video.id === videoId && !video.hidden)) return;
            switch (button.dataset.homeVideoAction) {
                case "watched": toggleWatched(videoId); break;
                case "save": toggleSaved(videoId); break;
                case "copy": copyVideoLink(videoId, button); break;
                case "queue": toggleWatchQueue(videoId); break;
            }
        });
    });
    document.getElementById("home-refresh")?.addEventListener("click", () => {
        refreshAllChannels(false);
    });
    document.getElementById("home-settings")?.addEventListener("click", openSettings);
    setupVideoButtons();
    updateNewVideoCount();
}

/* =========================================
   CONTENT
   ========================================= */

/* =========================================
   YOUR VIDEO LIBRARY — New, Saved, Watched
   Filter and sort already stored videos without extra YouTube API calls.
   The Recent videos section on New stays accessible.
   ========================================= */

function libraryVideoMatches(video, prefs) {
    const query = prefs.query.trim().toLocaleLowerCase();
    const titleAndChannel = `${video.title || ""} ${video.channel || ""}`.toLocaleLowerCase();
    const matchesText = !query || titleAndChannel.includes(query);
    const matchesChannel = !prefs.channel || (video.channel || "Unknown channel") === prefs.channel;
    return matchesText && matchesChannel;
}

function renderLibraryResults() {
    if (!LIBRARY_PAGES.includes(currentPage)) return;
    const results = document.getElementById("library-results");
    const summary = document.getElementById("library-results-summary");
    if (!results || !summary) return;

    const prefs = libraryViewPrefs[currentPage];
    const primary = getVisibleVideos();
    // Preserve the existing limit and rules for older channel uploads.
    const recent = currentPage === "new"
        ? videos.filter(video => !video.hidden && !video.isNew && !video.watched &&
            channels.some(channel => channel.id === video.channelId)).slice(0, 30)
        : [];
    const filteredPrimary = getSortedSearchResults(
        primary.filter(video => libraryVideoMatches(video, prefs)), prefs.sort);
    const filteredRecent = getSortedSearchResults(
        recent.filter(video => libraryVideoMatches(video, prefs)), prefs.sort);
    const showing = filteredPrimary.length + filteredRecent.length;
    const total = primary.length + recent.length;
    const isFiltered = Boolean(prefs.query.trim() || prefs.channel);

    summary.textContent = `Showing ${showing} of ${total} video${total === 1 ? "" : "s"}` +
        (currentPage === "new" ? " · includes recent channel uploads" : "");
    results.classList.toggle("is-compact", prefs.compact);

    const displayedIds = new Set([...filteredPrimary, ...filteredRecent].map(video => video.id));
    for (const id of librarySelectedIds) {
        if (!displayedIds.has(id)) librarySelectedIds.delete(id);
    }
    const primaryCards = filteredPrimary.map(video => createVideoCard(video, librarySelectMode)).join("");
    const recentCards = filteredRecent.map(video => createVideoCard(video, librarySelectMode)).join("");
    if (showing === 0) {
        const message = total === 0
            ? (currentPage === "new"
                ? "New videos will appear when your followed channels upload them."
                : currentPage === "saved"
                    ? "Save a video to see it here."
                    : "Mark a video as Watched to see it here.")
            : "No matching videos. Change your filters or clear them.";
        results.innerHTML = `<div class="empty-state">
            <div class="empty-icon">○</div>
            <h3>${isFiltered ? "No matching videos" : "Nothing here yet"}</h3>
            <p>${escapeHtml(message)}</p>
        </div>`;
        updateLibrarySelectionToolbar();
        return;
    }
    results.innerHTML = currentPage === "new" ? `
        ${filteredPrimary.length ? `<div class="library-section-heading">
            <h3>New uploads <span>${filteredPrimary.length}</span></h3>
        </div>${primaryCards}` : (!isFiltered ? `<p class="library-note">No new uploads right now.</p>` : "")}
        ${filteredRecent.length ? `<div class="library-section-heading">
            <h3>Recent videos <span>${filteredRecent.length}</span></h3>
            <p>From your followed channels · Not marked NEW</p>
        </div>${recentCards}` : ""}
    ` : primaryCards;
    setupVideoButtons();
    updateLibrarySelectionToolbar();
}

// Changes are restricted to the videos currently displayed under library filters.
function updateLibrarySelectionToolbar() {
    const panel = document.getElementById("library-bulk-panel");
    const toggle = document.getElementById("library-select-toggle");
    if (!panel || !toggle) return;
    panel.hidden = !librarySelectMode;
    toggle.textContent = librarySelectMode ? "✕ Done selecting" : "☑ Select videos";
    toggle.setAttribute("aria-pressed", String(librarySelectMode));

    const visibleBoxes = [...document.querySelectorAll("#library-results .bulk-video-check")];
    const visibleIds = new Set(visibleBoxes.map(input => input.value));
    for (const id of librarySelectedIds) {
        if (!visibleIds.has(id)) librarySelectedIds.delete(id);
    }
    const count = librarySelectedIds.size;
    const countEl = document.getElementById("library-selected-count");
    if (countEl) countEl.textContent = `${count} video${count === 1 ? "" : "s"} selected`;
    const selectAll = document.getElementById("library-select-all");
    if (selectAll) {
        const allSelected = visibleBoxes.length > 0 && count === visibleBoxes.length;
        selectAll.textContent = allSelected ? "Deselect all" : "Select all shown";
        selectAll.disabled = visibleBoxes.length === 0;
    }
    document.querySelectorAll("#library-bulk-panel [data-bulk-action]").forEach(button => {
        button.disabled = count === 0;
    });
}

function updateLibraryCardSelection(checkbox) {
    if (!librarySelectMode || !LIBRARY_PAGES.includes(currentPage)) return;
    const id = checkbox.value;
    const video = videos.find(item => item.id === id);
    if (!video || video.hidden) return;
    if (checkbox.checked) librarySelectedIds.add(id);
    else librarySelectedIds.delete(id);
    checkbox.closest(".video-card")?.classList.toggle("bulk-card-selected", checkbox.checked);
    updateLibrarySelectionToolbar();
}

function applyLibraryBulkAction(action) {
    if (!canModifyLibrary()) return;
    if (!librarySelectMode || !LIBRARY_PAGES.includes(currentPage)) return;
    const allowed = {
        new: ["watched", "save", "queue", "hide"],
        saved: ["watched", "unsave", "queue", "hide"],
        watched: ["unwatched", "save", "queue", "hide"]
    };
    if (!allowed[currentPage]?.includes(action)) return;
    const displayedIds = new Set([...document.querySelectorAll("#library-results .bulk-video-check")]
        .map(input => input.value));
    const chosen = videos.filter(video =>
        !video.hidden && displayedIds.has(video.id) && librarySelectedIds.has(video.id));
    if (chosen.length === 0) return;
    if (action === "hide" && !window.confirm(
        `Hide ${chosen.length} selected video${chosen.length === 1 ? "" : "s"}? You can restore them in Settings → Hidden videos.`
    )) return;

    if (action === "queue") {
        const additional = chosen.filter(video => !isQueued(video.id)).map(video => video.id);
        if (additional.length > WATCH_QUEUE_LIMIT - watchQueue.length) {
            alert(`Watch Queue can hold up to ${WATCH_QUEUE_LIMIT} videos.`);
            return;
        }
        if (!additional.length) {
            librarySelectedIds.clear();
            librarySelectMode = false;
            updateContent();
            return;
        }
        try {
            commitWatchQueue([...watchQueue, ...additional], videos);
        } catch (error) {
            alert("Could not save the queue. Check available Chrome storage.");
            return;
        }
        librarySelectedIds.clear();
        librarySelectMode = false;
        updateContent();
        return;
    }
    for (const video of chosen) {
        if (action === "watched") {
            video.watched = true;
            video.isNew = false;
        } else if (action === "unwatched") {
            video.watched = false;
            // Previously watched videos do not become NEW automatically.
        } else if (action === "save") {
            video.saved = true;
        } else if (action === "unsave") {
            video.saved = false;
        } else if (action === "hide") {
            video.hidden = true;
        }
    }
    // Hidden videos must no longer appear in the queue.
    if (action === "hide" || action === "watched") {
        watchQueue = watchQueue.filter(id => !chosen.some(video => video.id === id));
        saveWatchQueue();
    }
    // One storage write for the whole group; no extra API calls.
    saveVideos();
    librarySelectedIds.clear();
    librarySelectMode = false;
    updateContent();
    const status = document.getElementById("library-results-summary");
    if (status) {
        const actionLabels = {
            watched: "Marked as watched", unwatched: "Marked as unwatched",
            save: "Saved", unsave: "Removed from Saved", hide: "Hidden"
        };
        status.textContent = `${actionLabels[action]}: ${chosen.length} video${chosen.length === 1 ? "" : "s"}.`;
    }
}

function setupLibraryControls() {
    if (!LIBRARY_PAGES.includes(currentPage)) return;
    const prefs = libraryViewPrefs[currentPage];
    const search = document.getElementById("library-filter-query");
    const channel = document.getElementById("library-filter-channel");
    const sort = document.getElementById("library-filter-sort");
    const compact = document.getElementById("library-compact-toggle");
    const clear = document.getElementById("library-clear-filters");
    const selectToggle = document.getElementById("library-select-toggle");
    const selectAll = document.getElementById("library-select-all");
    const clearSelection = document.getElementById("library-clear-selection");

    document.getElementById("library-open-queue")?.addEventListener("click", () => navigateToPage("queue"));
    selectToggle?.addEventListener("click", () => {
        librarySelectMode = !librarySelectMode;
        librarySelectedIds.clear();
        renderLibraryResults();
    });
    selectAll?.addEventListener("click", () => {
        const boxes = [...document.querySelectorAll("#library-results .bulk-video-check")];
        const allSelected = boxes.length > 0 && boxes.every(input => input.checked);
        librarySelectedIds.clear();
        boxes.forEach(input => {
            input.checked = !allSelected;
            if (!allSelected) librarySelectedIds.add(input.value);
            input.closest(".video-card")?.classList.toggle("bulk-card-selected", !allSelected);
        });
        updateLibrarySelectionToolbar();
    });
    clearSelection?.addEventListener("click", () => {
        librarySelectedIds.clear();
        document.querySelectorAll("#library-results .bulk-video-check").forEach(input => {
            input.checked = false;
            input.closest(".video-card")?.classList.remove("bulk-card-selected");
        });
        updateLibrarySelectionToolbar();
    });
    document.querySelectorAll("#library-bulk-panel [data-bulk-action]").forEach(button => {
        button.addEventListener("click", () => applyLibraryBulkAction(button.dataset.bulkAction));
    });

    search?.addEventListener("input", event => {
        prefs.query = event.target.value.slice(0, 150);
        saveLibraryViewPrefs();
        renderLibraryResults(); // Keep the input and keyboard in place.
    });
    channel?.addEventListener("change", event => {
        prefs.channel = event.target.value;
        saveLibraryViewPrefs();
        renderLibraryResults();
    });
    sort?.addEventListener("change", event => {
        prefs.sort = LIBRARY_SORTS.includes(event.target.value) ? event.target.value : "newest";
        saveLibraryViewPrefs();
        renderLibraryResults();
    });
    compact?.addEventListener("click", () => {
        prefs.compact = !prefs.compact;
        compact.setAttribute("aria-pressed", String(prefs.compact));
        compact.textContent = prefs.compact ? "▦ Show thumbnails" : "☷ Compact list";
        saveLibraryViewPrefs();
        renderLibraryResults();
    });
    clear?.addEventListener("click", () => {
        prefs.query = "";
        prefs.channel = "";
        search.value = "";
        channel.value = "";
        saveLibraryViewPrefs();
        renderLibraryResults();
    });
}

/* =========================================
   VIDEO CARD
   ========================================= */

// getYouTubeVideoLink is provided by youtube-utils.js (loaded before app.js).

function createVideoCard(video, selectable = false) {
    const isSelected = selectable && librarySelectedIds.has(video.id);
    const videoLink = getYouTubeVideoLink(video.id);
    const watchedText = video.watched ? "✓ Watched" : "○ Watched";
    const savedText = video.saved ? "★ Saved" : "☆ Save";
    const downloadedText = video.downloaded ? "✓ Downloaded" : "↓ Download";
    const newBadge = video.isNew && !video.watched
        ? '<span class="video-new-badge">NEW</span>' : "";
    const thumbnail = video.thumbnail
        ? `<img class="thumbnail-image" src="${escapeHtml(video.thumbnail)}"
                 alt="" loading="lazy">`
        : '<span class="thumbnail-placeholder">VIDEO</span>';

    return `
        <article class="video-card video-card-v3 ${isSelected ? "bulk-card-selected" : ""}"
                 data-video-id="${escapeHtml(video.id)}">
            ${selectable ? `<label class="bulk-video-label">
                <input class="bulk-video-check" type="checkbox" value="${escapeHtml(video.id)}"
                    aria-label="Select ${escapeHtml(video.title)}" ${isSelected ? "checked" : ""}>
                <span>Select video</span>
            </label>` : ""}
            <div class="video-card-top">
                <button class="thumbnail video-thumb-watch" type="button"
                        aria-label="Watch ${escapeHtml(video.title)} on YouTube">
                    ${thumbnail}
                    ${newBadge}
                    <span class="video-thumb-play" aria-hidden="true">▶</span>
                </button>
                <div class="video-info">
                    <h3 title="${escapeHtml(video.title)}">${escapeHtml(video.title)}</h3>
                    <p class="channel-name">${escapeHtml(video.channel)}</p>
                    <p class="video-date">
                        ${escapeHtml(video.date)}
                        ${video.duration ? `<span class="video-duration">${escapeHtml(video.duration)}</span>` : ""}
                    </p>
                    ${videoLink ? `
                        <a class="video-url-row" href="${escapeHtml(videoLink)}"
                           target="_blank" rel="noopener noreferrer"
                           title="${escapeHtml(videoLink)}"
                           aria-label="Open YouTube link for ${escapeHtml(video.title)}">
                           <span aria-hidden="true">↗</span>
                           <span class="video-url-text">youtube.com/watch?v=${escapeHtml(video.id)}</span>
                        </a>` : ""}
                </div>
            </div>
            <div class="video-card-actions" aria-label="Video actions">
                <button class="action-button watch-button" type="button">▶ Watch</button>
                <button class="action-button save-button ${video.saved ? "is-active" : ""}"
                        type="button" aria-pressed="${video.saved}">${savedText}</button>
                <button class="action-button watched-button ${video.watched ? "is-active" : ""}"
                        type="button" aria-pressed="${video.watched}">${watchedText}</button>
                <button class="action-button copy-link-button" type="button"
                        ${videoLink ? '' : 'disabled'} aria-label="Copy video link">⧉ Copy link</button>
                <button class="action-button download-button ${video.downloaded ? "is-active" : ""}"
                        type="button" aria-pressed="${video.downloaded}"
                        title="Mark downloaded status (does not download a file)">${downloadedText}</button>
                <button class="action-button video-hide-button" type="button"
                        aria-label="Hide this video from your library">◌ Hide</button>
                <button class="action-button video-queue-button ${isQueued(video.id) ? "is-active" : ""}"
                        type="button" aria-pressed="${isQueued(video.id)}">
                        ${isQueued(video.id) ? "✓ In Queue" : "＋ Queue"}</button>
            </div>
        </article>
    `;
}

/* =========================================
   HTML SAFETY
   ========================================= */

// escapeHtml is provided by youtube-utils.js (loaded before app.js).

/* =========================================
   VIDEO BUTTONS
   ========================================= */

function setupVideoButtons() {
    document.querySelectorAll(".video-card").forEach(card => {
        const videoId = card.getAttribute("data-video-id");
        card.querySelector(".bulk-video-check")?.addEventListener("change", event => {
            updateLibraryCardSelection(event.currentTarget);
        });

        card.querySelector(".watch-button")
            ?.addEventListener("click", () => watchVideo(videoId));

        // The thumbnail is a second, larger watch target on touchscreens.
        card.querySelector(".video-thumb-watch")
            ?.addEventListener("click", () => watchVideo(videoId));

        card.querySelector(".copy-link-button")
            ?.addEventListener("click", event =>
                copyVideoLink(videoId, event.currentTarget));

        card.querySelector(".watched-button")
            ?.addEventListener("click", () => toggleWatched(videoId));

        card.querySelector(".save-button")
            ?.addEventListener("click", () => toggleSaved(videoId));

        card.querySelector(".download-button")
            ?.addEventListener("click", () => toggleDownloaded(videoId));

        card.querySelector(".video-hide-button")
            ?.addEventListener("click", () => hideVideo(videoId));

        card.querySelector(".video-queue-button")
            ?.addEventListener("click", () => toggleWatchQueue(videoId));
    });
}

async function copyVideoLink(videoId, button) {
    const url = getYouTubeVideoLink(videoId);
    if (!url) return;

    let copied = false;
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(url);
            copied = true;
        }
    } catch (error) {
        console.log("Clipboard API unavailable; trying copy fallback.", error);
    }

    if (!copied) {
        // Fallback for Chrome configurations without Clipboard API access.
        const input = document.createElement("textarea");
        input.value = url;
        input.setAttribute("readonly", "");
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.appendChild(input);
        input.select();
        try {
            copied = document.execCommand("copy");
        } catch (error) {
            console.log("Legacy copy unavailable.", error);
        } finally {
            input.remove();
        }
    }

    if (copied) {
        button.textContent = "✓ Copied!";
        button.setAttribute("aria-label", "Video link copied");
        window.setTimeout(() => {
            if (!button.isConnected) return;
            button.textContent = "⧉ Copy link";
            button.setAttribute("aria-label", "Copy video link");
        }, 2000);
    } else {
        // Never claim success if the browser denied clipboard access.
        window.prompt("Copy this video link:", url);
    }
}

function getActionVideo(videoId, persistIfSearched = false) {
    const existing = videos.find(item => item.id === videoId);
    if (existing) return existing;

    const found = searchResults.find(item => item.id === videoId);
    if (!found) return null;
    if (!persistIfSearched) return found;

    const stored = { ...found, isNew: false };
    videos.push(stored);
    sortVideos();
    return stored;
}

function watchVideo(videoId) {
    const video = getActionVideo(videoId);
    if (!video) return;

    if (video.youtubeUrl) {
        window.open(video.youtubeUrl, "_blank");
    } else {
        alert("No YouTube link is available.");
    }
}

function hideVideo(videoId) {
    if (!canModifyLibrary()) return;
    const video = getActionVideo(videoId, true);
    if (!video || video.hidden) return;
    video.hidden = true;
    // Hiding also removes the video from the visible queue, without losing its video history.
    if (isQueued(videoId)) {
        watchQueue = watchQueue.filter(id => id !== videoId);
        saveWatchQueue();
    }
    // Keep NEW / Watched / Saved / Downloaded intact for a future restore.
    saveVideos();
    updateContent();
}

function toggleWatched(videoId) {
    if (!canModifyLibrary()) return;
    const video = getActionVideo(videoId, true);
    if (!video) return;

    video.watched = !video.watched;

    // Once the user marks a video as watched, it is no longer NEW.
    if (video.watched) {
        video.isNew = false;
        if (isQueued(videoId)) {
            watchQueue = watchQueue.filter(id => id !== videoId);
            saveWatchQueue();
        }
    }

    saveVideos();
    updateContent();
}

function toggleSaved(videoId) {
    if (!canModifyLibrary()) return;
    const video = getActionVideo(videoId, true);
    if (!video) return;

    video.saved = !video.saved;
    saveVideos();
    updateContent();
}

function toggleDownloaded(videoId) {
    if (!canModifyLibrary()) return;
    const video = getActionVideo(videoId, true);
    if (!video) return;

    /*
       Status only for now.
       No actual YouTube file download is performed.
    */
    video.downloaded = !video.downloaded;

    saveVideos();
    updateContent();
}

/* =========================================
   YOUTUBE SEARCH — MANUAL / USER-INITIATED
   ========================================= */

function renderSearchPage() {
    const videoList = document.querySelector(".video-list");
    const sectionTitle = document.querySelector(".section-header h2");
    if (!videoList || !sectionTitle) return;

    sectionTitle.textContent = "Search YouTube";
    document.getElementById("refresh-page-button")?.remove();

    // Render videos using the same cards as the rest of the application,
    // but never mark search-only videos as NEW.
    const visibleSearchResults = searchResults.filter(item =>
        !videos.some(stored => stored.id === item.id && stored.hidden));
    const resultCards = getSortedSearchResults(visibleSearchResults, searchResultSort).map(item => {
        const stored = videos.find(video => video.id === item.id);
        const display = stored
            ? { ...item, watched: stored.watched, saved: stored.saved,
                downloaded: stored.downloaded, isNew: false }
            : { ...item, isNew: false };
        return createVideoCard(display);
    }).join("");

    const savedSearchCards = savedSearches.length > 0
        ? savedSearches.map(item => `
            <div style="display:grid;grid-template-columns:minmax(0,1fr);
                        gap:12px;padding:12px;background:#0f172a;
                        border:1px solid #334155;border-radius:12px;
                        max-width:100%;box-sizing:border-box;">
                <div style="min-width:0;">
                    <div style="font-weight:600;overflow-wrap:anywhere;">
                        ${escapeHtml(item.query)}
                    </div>
                    <div style="font-size:12px;color:#94a3b8;margin-top:4px;">
                        ${item.minMinutes}+ min · ${item.resultLimit} videos · ${searchPeriodLabel(item.period)} · ${searchDepthLabel(item.searchDepth)} · Newest first
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));
                            width:100%;min-width:0;gap:6px;">
                    <button type="button" class="saved-search-run"
                            data-saved-search-id="${escapeHtml(item.id)}"
                            aria-label="Run saved search ${escapeHtml(item.query)}"
                            style="width:100%;min-width:0;box-sizing:border-box;padding:9px 4px;border-radius:9px;
                                   border:none;background:#2563eb;color:white;"
                            ${searchInProgress ? "disabled" : ""}>Run</button>
                    <button type="button" class="saved-search-edit"
                            data-saved-search-id="${escapeHtml(item.id)}"
                            aria-label="Edit saved search ${escapeHtml(item.query)}"
                            style="width:100%;min-width:0;box-sizing:border-box;padding:9px 4px;border-radius:9px;
                                   border:1px solid #475569;background:transparent;
                                   color:#cbd5e1;"
                            ${searchInProgress ? "disabled" : ""}>Edit</button>
                    <button type="button" class="saved-search-delete"
                            data-saved-search-id="${escapeHtml(item.id)}"
                            aria-label="Remove saved search ${escapeHtml(item.query)}"
                            style="width:100%;min-width:0;box-sizing:border-box;padding:9px 4px;border-radius:9px;
                                   border:1px solid #475569;background:transparent;
                                   color:#cbd5e1;"
                            ${searchInProgress ? "disabled" : ""}>Remove</button>
                </div>
            </div>
        `).join("")
        : '<p style="font-size:13px;color:#94a3b8;">No saved searches yet.</p>';

    videoList.innerHTML = `
        <form id="youtube-search-form" class="channel-form"
              style="margin-bottom:12px;">
            ${editingSavedSearchId ? `
                <p role="status" style="margin:0;font-size:13px;color:#93c5fd;">
                    Editing saved search — changes are not saved yet.
                </p>` : ""}
            <label for="youtube-search-query">Search words or title
                <input id="youtube-search-query" name="query" type="search"
                       maxlength="150" required
                       placeholder="e.g. Bulgarian news"
                       value="${escapeHtml(searchPreferences.query)}">
            </label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                <label for="youtube-search-minutes">Minimum minutes
                    <input id="youtube-search-minutes" name="minutes"
                           type="number" inputmode="numeric" min="1"
                           max="600" step="1" required
                           value="${searchPreferences.minMinutes}">
                </label>
                <label for="youtube-search-limit">Results
                    <select id="youtube-search-limit" name="limit"
                            style="width:100%;min-height:45px;padding:10px;
                                   border:1px solid #334155;border-radius:10px;
                                   background:#0f172a;color:#f8fafc;">
                        <option value="10" ${searchPreferences.resultLimit === 10 ? "selected" : ""}>10 videos</option>
                        <option value="20" ${searchPreferences.resultLimit === 20 ? "selected" : ""}>20 videos</option>
                    </select>
                </label>
            </div>
            <label for="youtube-search-period">Published
                <select id="youtube-search-period" name="period"
                        style="width:100%;min-height:45px;padding:10px;
                               border:1px solid #334155;border-radius:10px;
                               background:#0f172a;color:#f8fafc;">
                    <option value="any" ${normalizeSearchPeriod(searchPreferences.period) === "any" ? "selected" : ""}>Any time</option>
                    <option value="day" ${searchPreferences.period === "day" ? "selected" : ""}>Last 24 hours</option>
                    <option value="week" ${searchPreferences.period === "week" ? "selected" : ""}>Last 7 days</option>
                    <option value="month" ${searchPreferences.period === "month" ? "selected" : ""}>Last 30 days</option>
                </select>
            </label>
            <label for="youtube-search-depth">Search depth
                <select id="youtube-search-depth" name="searchDepth"
                        style="width:100%;min-height:45px;padding:10px;
                               border:1px solid #334155;border-radius:10px;
                               background:#0f172a;color:#f8fafc;">
                    <option value="1" ${normalizeSearchDepth(searchPreferences.searchDepth) === 1 ? "selected" : ""}>Quick · up to 50 videos</option>
                    <option value="3" ${normalizeSearchDepth(searchPreferences.searchDepth) === 3 ? "selected" : ""}>Standard · up to 150 videos</option>
                    <option value="5" ${normalizeSearchDepth(searchPreferences.searchDepth) === 5 ? "selected" : ""}>Thorough · up to 250 videos</option>
                </select>
            </label>
            <p style="margin:0;font-size:12px;color:#94a3b8;">
                Newest first · At least the selected duration.
                Search depth controls the maximum candidates checked (1, 3 or 5 pages).
                Each page uses a separate YouTube search API request; searching stops early if enough matches are found.
                Matching searches are reused for 10 minutes to save API requests.
                Use Get fresh results to check YouTube immediately.
            </p>
            <button class="form-button form-save-button" type="submit"
                    style="width:100%;" ${searchInProgress ? "disabled" : ""}>
                ${searchInProgress ? "Searching..." : "⌕ Search YouTube"}
            </button>
            <button type="button" id="force-fresh-search-button"
                    class="form-button"
                    style="width:100%;margin-top:8px;border:1px solid #475569;"
                    ${searchInProgress ? "disabled" : ""}>
                ↻ Get fresh results
            </button>
            <button type="button" id="save-youtube-search-button"
                    class="form-button"
                    style="width:100%;margin-top:8px;border:1px solid #475569;"
                    ${searchInProgress ? "disabled" : ""}>
                ${editingSavedSearchId ? "✓ Save changes" : "☆ Save this search"}
            </button>
            ${editingSavedSearchId ? `
                <button type="button" id="cancel-edit-search-button"
                        class="form-button"
                        style="width:100%;margin-top:8px;border:1px solid #475569;"
                        ${searchInProgress ? "disabled" : ""}>
                    Cancel edit
                </button>` : ""}
        </form>
        <section aria-label="API usage today" style="margin:0 0 16px;">
            ${apiUsageHtml()}
        </section>
        <section aria-label="Saved searches" style="margin:0 0 16px;">
            <h3 style="font-size:16px;margin:0 0 10px;">
                Saved searches (${savedSearches.length})
            </h3>
            <p style="margin:0 0 8px;font-size:12px;color:#94a3b8;">
                Tap Edit to change words, duration, result count, publishing period or search depth.
            </p>
            <div style="display:grid;gap:8px;">${savedSearchCards}</div>
        </section>
        <p role="status" aria-live="polite"
           style="margin:4px 0 14px;font-size:13px;color:#94a3b8;">
            ${escapeHtml(searchResultMessage)}
        </p>
        ${searchResults.length > visibleSearchResults.length ? `
            <p style="font-size:12px;color:#94a3b8;margin:8px 0 12px;">
                ${searchResults.length - visibleSearchResults.length} hidden video${searchResults.length - visibleSearchResults.length === 1 ? "" : "s"} excluded.
                Restore from Settings → Hidden videos.
            </p>` : ""}
        ${searchWasRun && visibleSearchResults.length > 0 ? `
            <section aria-label="Sort found videos" style="margin:12px 0 16px;
                    padding:12px;border:1px solid #334155;border-radius:12px;
                    background:#0f172a;">
                <label for="youtube-results-sort" style="display:block;
                        font-size:13px;font-weight:600;margin-bottom:8px;">
                    Found videos (${visibleSearchResults.length}) · Sort results
                </label>
                <select id="youtube-results-sort"
                        style="width:100%;min-height:45px;padding:10px;
                               border:1px solid #475569;border-radius:10px;
                               background:#111827;color:#f8fafc;">
                    <option value="newest" ${searchResultSort === "newest" ? "selected" : ""}>Newest first</option>
                    <option value="oldest" ${searchResultSort === "oldest" ? "selected" : ""}>Oldest first</option>
                    <option value="longest" ${searchResultSort === "longest" ? "selected" : ""}>Longest first</option>
                    <option value="shortest" ${searchResultSort === "shortest" ? "selected" : ""}>Shortest first</option>
                </select>
                <p style="font-size:12px;color:#94a3b8;margin:8px 0 0;">
                    Reorders only the videos already found · No extra API requests.
                </p>
            </section>` : ""}
        ${searchWasRun && searchResults.length > 0 && visibleSearchResults.length === 0 ? `
            <div class="empty-state"><h3>All results are hidden</h3>
                <p>Restore videos in Settings → Hidden videos, or try another search.</p>
            </div>` : ""}
        ${resultCards}
    `;

    document.getElementById("youtube-results-sort")
        ?.addEventListener("change", event => {
            searchResultSort = normalizeSearchResultSort(event.target.value);
            try {
                localStorage.setItem(SEARCH_RESULTS_SORT_KEY, searchResultSort);
            } catch (error) {
                console.log("Could not save result order; sorting still works.", error);
            }
            // Sorting is entirely local: it never reruns the YouTube search.
            if (currentPage === "search") updateContent();
        });
    document.getElementById("youtube-search-form")
        ?.addEventListener("submit", handleSearchSubmit);
    document.getElementById("force-fresh-search-button")
        ?.addEventListener("click", handleForceFreshSearch);
    document.getElementById("save-youtube-search-button")
        ?.addEventListener("click", handleSaveSearch);
    document.querySelectorAll(".saved-search-run").forEach(button => {
        button.addEventListener("click", () =>
            handleRunSavedSearch(button.dataset.savedSearchId));
    });
    document.querySelectorAll(".saved-search-edit").forEach(button => {
        button.addEventListener("click", () =>
            handleEditSavedSearch(button.dataset.savedSearchId));
    });
    document.querySelectorAll(".saved-search-delete").forEach(button => {
        button.addEventListener("click", () =>
            handleDeleteSavedSearch(button.dataset.savedSearchId));
    });
    document.getElementById("cancel-edit-search-button")
        ?.addEventListener("click", handleCancelEditSavedSearch);
    setupVideoButtons();
}

async function handleSearchSubmit(event) {
    event.preventDefault();
    if (searchInProgress) return;
    const preferences = readSearchForm();
    if (!preferences) return;
    await runYouTubeSearch(preferences);
}

async function handleForceFreshSearch() {
    if (searchInProgress) return;
    const preferences = readSearchForm();
    if (!preferences) return;
    await runYouTubeSearch(preferences, true);
}

async function runYouTubeSearch(preferences, forceFresh = false) {
    if (searchInProgress) return;
    if (!getApiKey()) {
        alert("Save your YouTube API key in Settings first.");
        return;
    }

    editingSavedSearchId = null;
    searchPreferencesBeforeEdit = null;
    searchPreferences = { ...preferences };
    saveSearchPreferences();

    const cached = forceFresh ? null : getCachedSearch(searchPreferences);
    if (cached) {
        searchResults = cached.results;
        searchWasRun = true;
        const ageMinutes = Math.floor((Date.now() - cached.savedAt) / 60000);
        searchResultMessage =
            `${searchResults.length} saved result${searchResults.length === 1 ? "" : "s"} ` +
            `from ${ageMinutes < 1 ? "less than a minute" : `${ageMinutes} min`} ago. ` +
            "No new API request. Tap Get fresh results to check YouTube now.";
        if (currentPage === "search") updateContent();
        return;
    }

    searchInProgress = true;
    searchResultMessage = "Searching YouTube...";
    if (currentPage === "search") updateContent();

    try {
        const freshResults = await searchYouTubeVideos(
            searchPreferences.query,
            searchPreferences.minMinutes,
            searchPreferences.resultLimit,
            searchPreferences.period,
            searchPreferences.searchDepth
        );
        searchResults = freshResults;
        // Cache only complete, successful requests (including zero matches).
        rememberSearchResults(searchPreferences, freshResults);
        searchWasRun = true;
        const count = searchResults.length;
        searchResultMessage = count
            ? `${count} video${count === 1 ? "" : "s"} found · Searched newest first · ${preferences.minMinutes}+ minutes · ${searchPeriodLabel(preferences.period)} · ${searchDepthLabel(preferences.searchDepth)} search.` +
                (count < searchPreferences.resultLimit
                    ? " No more matches in the checked results." : "")
            : "No matching videos in the checked results. Try different words or a shorter duration.";
    } catch (error) {
        console.log("YouTube search error:", error);
        if (error.message === "quotaExceeded" || error.message === "rateLimitExceeded") {
            searchResultMessage = "YouTube API search limit reached. Try again later.";
        } else if (error.message === "keyInvalid" || error.message === "forbidden") {
            searchResultMessage = "YouTube rejected the request. Check the API key and its restrictions.";
        } else {
            searchResultMessage = "Search failed. Check your connection and try again.";
        }
    } finally {
        searchInProgress = false;
        if (currentPage === "search") updateContent();
    }
}

// parseYouTubeDurationSeconds is provided by youtube-utils.js (loaded before app.js).

async function searchYouTubeVideos(query, minimumMinutes, resultLimit, period = "any", searchDepth = 3) {
    const cutoffHours = SEARCH_PERIOD_HOURS[normalizeSearchPeriod(period)];
    const publishedAfterMs = cutoffHours ? Date.now() - cutoffHours * 3600000 : null;
    const matches = [];
    const seen = new Set();
    let pageToken = "";
    const minimumSeconds = minimumMinutes * 60;

    // 1, 3 or 5 pages; stop as soon as requested matches are found.
    // Some queries still won't provide the full requested 10 or 20 matches.
    const maxPages = normalizeSearchDepth(searchDepth);
    for (let page = 0; page < maxPages && matches.length < resultLimit; page++) {
        const searchParams = {
            part: "snippet",
            q: query,
            type: "video",
            order: "date",
            maxResults: "50",
            videoDuration: minimumMinutes > 20 ? "long" : "any"
        };
        if (publishedAfterMs !== null) {
            searchParams.publishedAfter = new Date(publishedAfterMs).toISOString();
        }
        if (pageToken) searchParams.pageToken = pageToken;

        const found = await youtubeApiRequest("search", searchParams);
        const ids = (found.items || [])
            .map(item => item?.id?.videoId)
            .filter(id => id && !seen.has(id));
        ids.forEach(id => seen.add(id));

        if (ids.length > 0) {
            const detailResponse = await youtubeApiRequest("videos", {
                part: "snippet,contentDetails",
                id: ids.join(","),
                maxResults: "50"
            });
            for (const item of detailResponse.items || []) {
                const seconds = parseYouTubeDurationSeconds(item?.contentDetails?.duration);
                if (seconds === null || seconds < minimumSeconds) continue;
                const publishedAt = item?.snippet?.publishedAt || "";
                // Validate the actual video date as well as the search result.
                if (publishedAfterMs !== null &&
                    !(Date.parse(publishedAt) >= publishedAfterMs)) continue;
                const video = createVideoObject({
                    id: item.id,
                    title: item?.snippet?.title || "Untitled video",
                    channel: item?.snippet?.channelTitle || "Unknown channel",
                    channelId: item?.snippet?.channelId || "",
                    publishedAt,
                    duration: formatDuration(item?.contentDetails?.duration),
                    thumbnail: item?.snippet?.thumbnails?.high?.url ||
                        item?.snippet?.thumbnails?.medium?.url ||
                        item?.snippet?.thumbnails?.default?.url || ""
                });
                video.isNew = false;
                matches.push(video);
            }
        }
        pageToken = found.nextPageToken || "";
        if (!pageToken) break;
    }

    matches.sort((a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
    return matches.slice(0, resultLimit);
}

/* =========================================
   YOUTUBE CHANNEL URL
   ========================================= */

// parseYouTubeChannelUrl is provided by youtube-utils.js (loaded before app.js).

/* =========================================
   YOUTUBE API REQUEST
   ========================================= */

// youtubeApiRequest is provided by youtube-api.js (loaded before app.js).

/* =========================================
   FIND CHANNEL
   ========================================= */

async function findYouTubeChannel(parsedUrl) {
    const parameters = {
        part: "snippet,contentDetails"
    };

    if (parsedUrl.type === "handle") {
        parameters.forHandle = parsedUrl.value;
    } else if (parsedUrl.type === "id") {
        parameters.id = parsedUrl.value;
    } else if (parsedUrl.type === "username") {
        parameters.forUsername = parsedUrl.value;
    } else {
        throw new Error("UNSUPPORTED_CHANNEL_URL");
    }

    const response = await youtubeApiRequest(
        "channels",
        parameters
    );

    if (!response.items || response.items.length === 0) {
        throw new Error("CHANNEL_NOT_FOUND");
    }

    return response.items[0];
}

/* =========================================
   LOAD CHANNEL VIDEOS
   ========================================= */

async function loadChannelVideos(channel) {
    const playlistId =
        channel?.contentDetails?.relatedPlaylists?.uploads;

    if (!playlistId) {
        throw new Error("UPLOADS_PLAYLIST_NOT_FOUND");
    }

    const playlistResponse = await youtubeApiRequest(
        "playlistItems",
        {
            part: "snippet,contentDetails",
            playlistId,
            maxResults: "10"
        }
    );

    if (!playlistResponse.items) return [];

    const videoIds = playlistResponse.items
        .map(item => item?.contentDetails?.videoId)
        .filter(Boolean);

    if (videoIds.length === 0) return [];

    const videoResponse = await youtubeApiRequest(
        "videos",
        {
            part: "snippet,contentDetails",
            id: videoIds.join(",")
        }
    );

    const videoMap = new Map();

    (videoResponse.items || []).forEach(item => {
        videoMap.set(item.id, item);
    });

    return playlistResponse.items
        .map(item => {
            const videoId = item?.contentDetails?.videoId;
            if (!videoId) return null;

            const details = videoMap.get(videoId);
            const snippet = item.snippet;
            // The videos endpoint contains the video's publication time.
            // Playlist-item publishedAt can be when it was added to the playlist.
            const publishedAt =
                details?.snippet?.publishedAt ||
                snippet?.publishedAt ||
                "";

            return createVideoObject({
                id: videoId,
                title: snippet?.title || "Untitled video",
                channel:
                    snippet?.channelTitle ||
                    channel?.snippet?.title ||
                    "Unknown channel",
                channelId: channel.id,
                publishedAt,
                duration: details
                    ? formatDuration(details?.contentDetails?.duration)
                    : "",
                thumbnail:
                    snippet?.thumbnails?.maxres?.url ||
                    snippet?.thumbnails?.high?.url ||
                    snippet?.thumbnails?.medium?.url ||
                    snippet?.thumbnails?.default?.url ||
                    ""
            });
        })
        .filter(Boolean);
}

function createVideoObject(data) {
    return {
        id: data.id,
        title: data.title,
        channel: data.channel,
        channelId: data.channelId,
        date: formatYouTubeDate(data.publishedAt),
        publishedAt: data.publishedAt,
        duration: data.duration || "",
        watched: false,
        saved: false,
        downloaded: false,
        isNew: true,
        firstSeenAt: new Date().toISOString(),
        youtubeUrl:
            `https://www.youtube.com/watch?v=${data.id}`,
        thumbnail: data.thumbnail || ""
    };
}

/* =========================================
   LOAD SAVED CHANNEL
   ========================================= */

async function loadVideosFromSavedChannel(savedChannel) {
    if (!savedChannel.uploadsPlaylistId) {
        const parsedUrl = parseYouTubeChannelUrl(
            savedChannel.originalUrl || savedChannel.url
        );

        if (!parsedUrl.valid) {
            throw new Error("CHANNEL_NOT_FOUND");
        }

        const channel = await findYouTubeChannel(parsedUrl);
        return loadChannelVideos(channel);
    }

    const playlistResponse = await youtubeApiRequest(
        "playlistItems",
        {
            part: "snippet,contentDetails",
            playlistId: savedChannel.uploadsPlaylistId,
            maxResults: "10"
        }
    );

    if (!playlistResponse.items) return [];

    const videoIds = playlistResponse.items
        .map(item => item?.contentDetails?.videoId)
        .filter(Boolean);

    if (videoIds.length === 0) return [];

    const videoResponse = await youtubeApiRequest(
        "videos",
        {
            part: "snippet,contentDetails",
            id: videoIds.join(",")
        }
    );

    const videoMap = new Map();

    (videoResponse.items || []).forEach(item => {
        videoMap.set(item.id, item);
    });

    return playlistResponse.items
        .map(item => {
            const videoId = item?.contentDetails?.videoId;
            if (!videoId) return null;

            const details = videoMap.get(videoId);
            const snippet = item.snippet;
            // The videos endpoint contains the video's publication time.
            // Playlist-item publishedAt can be when it was added to the playlist.
            const publishedAt =
                details?.snippet?.publishedAt ||
                snippet?.publishedAt ||
                "";

            return createVideoObject({
                id: videoId,
                title: snippet?.title || "Untitled video",
                channel:
                    snippet?.channelTitle ||
                    savedChannel.name ||
                    "Unknown channel",
                channelId: savedChannel.id,
                publishedAt,
                duration: details
                    ? formatDuration(details?.contentDetails?.duration)
                    : "",
                thumbnail:
                    snippet?.thumbnails?.maxres?.url ||
                    snippet?.thumbnails?.high?.url ||
                    snippet?.thumbnails?.medium?.url ||
                    snippet?.thumbnails?.default?.url ||
                    ""
            });
        })
        .filter(Boolean);
}

/* =========================================
   DATE / TIME
   ========================================= */

// formatYouTubeDate is provided by youtube-utils.js (loaded before app.js).

// formatDateTime is provided by youtube-utils.js (loaded before app.js).

function getLastRefreshText() {
    const timestamp = getLastRefreshTime();
    if (!timestamp) return "";

    return `Last refreshed: ${formatDateTime(new Date(timestamp))}`;
}

/* =========================================
   DURATION
   ========================================= */

// formatDuration is provided by youtube-utils.js (loaded before app.js).

/* =========================================
   MERGE VIDEO
   ========================================= */

function mergeVideo(newVideo, markAsNew = true) {
    const existingIndex = videos.findIndex(
        video => video.id === newVideo.id
    );

    if (existingIndex === -1) {
        videos.push({
            ...newVideo,
            isNew: markAsNew,
            firstSeenAt:
                newVideo.firstSeenAt ||
                new Date().toISOString()
        });
        return;
    }

    const oldVideo = videos[existingIndex];

    videos[existingIndex] = {
        ...oldVideo,
        title: newVideo.title,
        channel: newVideo.channel,
        channelId: newVideo.channelId,
        date: newVideo.date,
        publishedAt: newVideo.publishedAt,
        duration: newVideo.duration,
        youtubeUrl: newVideo.youtubeUrl,
        thumbnail: newVideo.thumbnail,

        // Preserve the user's existing NEW / watched state.
        isNew: Boolean(oldVideo.isNew),
        firstSeenAt:
            oldVideo.firstSeenAt ||
            newVideo.firstSeenAt ||
            new Date().toISOString()
    };
}

/* =========================================
   REFRESH ALL CHANNELS
   ========================================= */

async function refreshAllChannels(silent = false) {
    if (storageIntegrityIssue) {
        if (!silent) alert("Restore a valid backup before refreshing: saved data needs recovery.");
        return;
    }
    if (refreshInProgress) return;

    if (channels.length === 0) {
        if (!silent) {
            alert("There are no channels to refresh.");
        }
        return;
    }

    if (!getApiKey()) {
        if (!silent) {
            alert("No YouTube API key has been saved.");
        }
        return;
    }

    refreshInProgress = true;
    updateRefreshButtons(true);

    let successfulChannels = 0;
    let failedChannels = 0;
    let totalVideos = 0;
    let newVideosFound = 0;

    try {
        for (const channel of channels) {
            try {
                const latestVideos =
                    await loadVideosFromSavedChannel(channel);

                latestVideos.forEach(video => {
                    const existed = videos.some(
                        existing => existing.id === video.id
                    );

                    mergeVideo(video);

                    if (!existed) {
                        newVideosFound++;
                    }
                });

                totalVideos += latestVideos.length;
                successfulChannels++;

                channel.lastUpdated =
                    formatDateTime(new Date());

            } catch (error) {
                console.log(
                    `Could not refresh ${channel.name}:`,
                    error
                );

                failedChannels++;
            }
        }

        sortVideos();
        saveVideos();
        saveChannels();

        // A failed request must not count as a successful refresh.
        // Keep successfully loaded videos if only some channels worked.
        if (successfulChannels > 0) {
            saveLastRefreshTime();
        }

        updateContent();

        if (!silent) {
            const result =
                successfulChannels === 0
                    ? "Refresh failed. No channels could be updated."
                    : failedChannels > 0
                        ? "Refresh partially complete."
                        : "Refresh complete.";

            alert(
                `${result}\n\n` +
                `Channels updated: ${successfulChannels}\n` +
                `Channels with errors: ${failedChannels}\n` +
                `Videos received: ${totalVideos}\n` +
                `New videos found: ${newVideosFound}`
            );
        }
    } finally {
        refreshInProgress = false;
        updateRefreshButtons(false);
    }
}

function updateRefreshButtons(refreshing) {
    const pageButton =
        document.getElementById("refresh-page-button");

    const channelsButton =
        document.getElementById("refresh-all-channels-button");

    if (pageButton) {
        pageButton.disabled = refreshing;
        pageButton.textContent =
            refreshing ? "Refreshing..." : "↻ Refresh";
    }

    if (channelsButton) {
        channelsButton.disabled = refreshing;
        channelsButton.textContent =
            refreshing
                ? "Refreshing..."
                : "↻ Refresh All Channels";
    }
}

/* =========================================
   AUTOMATIC REFRESH
   ========================================= */

async function maybeAutoRefresh() {
    if (storageIntegrityIssue || refreshInProgress || channels.length === 0 || !getApiKey()) return;
    // Android may suspend an app in the background. Resume on visibility or online events.
    if (document.visibilityState === "hidden" || navigator.onLine === false) return;

    const now = Date.now();
    if (now - getLastRefreshTime() < AUTO_REFRESH_INTERVAL) return;
    if (now - lastAutomaticRefreshAttempt < AUTO_REFRESH_RETRY_INTERVAL) return;

    lastAutomaticRefreshAttempt = now;
    try {
        await refreshAllChannels(true);
    } catch (error) {
        console.warn("Automatic channel refresh did not finish:", error);
    }
}

function startAutomaticRefresh() {
    // This timer only checks the saved timestamp; it does not contact YouTube unless due.
    setInterval(() => { void maybeAutoRefresh(); }, AUTO_REFRESH_CHECK_INTERVAL);
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") void maybeAutoRefresh();
    });
    window.addEventListener("online", () => { void maybeAutoRefresh(); });
}

/* =========================================
   CHANNELS — overview and per-channel video library
   - Counts only videos already stored on this device.
   - No extra YouTube API calls, no data migration.
   - Active channel and filter are temporary UI state.
   ========================================= */

const CHANNEL_VIDEO_FILTERS = ["all", "new", "saved", "watched"];

function getChannelVideos(channelId) {
    return videos.filter(video => !video.hidden && video.channelId === channelId);
}

function getChannelStats(channelId) {
    const channelVideos = getChannelVideos(channelId);
    return {
        total: channelVideos.length,
        new: channelVideos.filter(video => video.isNew && !video.watched).length,
        saved: channelVideos.filter(video => video.saved).length,
        watched: channelVideos.filter(video => video.watched).length
    };
}

function openChannelVideos(channelId) {
    if (!channels.some(channel => channel.id === channelId)) return;
    activeChannelId = channelId;
    activeChannelVideoFilter = "all";
    updateContent();
    window.scrollTo(0, 0);
}

function renderChannelVideoDetail(channel) {
    const videoList = document.querySelector(".video-list");
    const sectionTitle = document.querySelector(".section-header h2");
    if (!videoList || !sectionTitle) return;

    sectionTitle.textContent = "Channel videos";
    const stats = getChannelStats(channel.id);
    const matches = getChannelVideos(channel.id).filter(video => {
        if (activeChannelVideoFilter === "new") return video.isNew && !video.watched;
        if (activeChannelVideoFilter === "saved") return video.saved;
        if (activeChannelVideoFilter === "watched") return video.watched;
        return true;
    });
    // Video storage is already sorted newest-first. Do not mutate it here.
    const filterNames = { all: "All videos", new: "New", saved: "Saved", watched: "Watched" };

    videoList.innerHTML = `
        <section class="channel-detail" aria-label="Videos from ${escapeHtml(channel.name)}">
            <button type="button" id="channel-back-button" class="channel-back-button">
                ← Back to channels
            </button>
            <div class="channel-detail-heading">
                ${channel.thumbnail ? `<img class="channel-detail-thumbnail"
                    src="${escapeHtml(channel.thumbnail)}" alt="">` : ""}
                <div class="channel-detail-heading-text">
                    <h3>${escapeHtml(channel.name)}</h3>
                    <p>${stats.total} videos stored on this device</p>
                </div>
            </div>
            <div class="channel-detail-filters" role="group" aria-label="Filter channel videos">
                ${CHANNEL_VIDEO_FILTERS.map(filter => {
                    const count = filter === "all" ? stats.total : stats[filter];
                    const active = filter === activeChannelVideoFilter;
                    return `<button type="button" class="channel-filter-button${active ? " is-selected" : ""}"
                        data-channel-filter="${filter}" aria-pressed="${active}">
                        ${filterNames[filter]} <span>${count}</span>
                    </button>`;
                }).join("")}
            </div>
            <p class="channel-detail-note">Only videos already found or saved by My YouTube are shown.
                Refresh the channels to check for new uploads.</p>
            <p class="channel-detail-summary" role="status">
                Showing ${matches.length} of ${stats.total} stored video${stats.total === 1 ? "" : "s"}
            </p>
        </section>
        <div class="channel-detail-videos">
            ${matches.length
                ? matches.map(video => createVideoCard(video)).join("")
                : `<div class="empty-state">
                    <h3>No ${filterNames[activeChannelVideoFilter].toLowerCase()} here yet</h3>
                    <p>${activeChannelVideoFilter === "all"
                        ? "This channel has no stored videos yet. Try Refresh All Channels from the channel list."
                        : "Choose All videos to see the other videos from this channel."}</p>
                   </div>`}
        </div>
    `;

    document.getElementById("channel-back-button")?.addEventListener("click", () => {
        activeChannelId = null;
        activeChannelVideoFilter = "all";
        updateContent();
        window.scrollTo(0, 0);
    });
    videoList.querySelectorAll("[data-channel-filter]").forEach(button => {
        button.addEventListener("click", () => {
            const filter = button.dataset.channelFilter;
            if (!CHANNEL_VIDEO_FILTERS.includes(filter)) return;
            activeChannelVideoFilter = filter;
            updateContent();
        });
    });
    setupVideoButtons();
    updateNewVideoCount();
}

function renderChannelsPage() {
    const videoList = document.querySelector(".video-list");
    const sectionTitle = document.querySelector(".section-header h2");
    if (!videoList || !sectionTitle) return;

    sectionTitle.textContent = "Channels";
    document.getElementById("refresh-page-button")?.remove();

    if (activeChannelId) {
        const selectedChannel = channels.find(channel => channel.id === activeChannelId);
        if (selectedChannel) {
            renderChannelVideoDetail(selectedChannel);
            return;
        }
        activeChannelId = null; // Channel was deleted or replaced by Restore.
    }

    if (channels.length === 0) {
        videoList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">▣</div>
                <h3>No channels yet</h3>
                <p>Add a YouTube channel to start following it.</p>
                <button class="add-channel-button" type="button">+ Add channel</button>
            </div>
        `;
        setupAddChannelButton();
        updateNewVideoCount();
        return;
    }

    const channelNewCount = channels.reduce((total, channel) =>
        total + getChannelStats(channel.id).new, 0);

    videoList.innerHTML = `
        <div class="channels-overview">
            <strong>${channels.length} followed channel${channels.length === 1 ? "" : "s"}</strong>
            <span>${channelNewCount} new video${channelNewCount === 1 ? "" : "s"} across your channels</span>
        </div>
        <div class="channels-top-actions">
            <button class="add-channel-button" type="button">+ Add channel</button>
            <button class="add-channel-button" id="channels-smart-feed" type="button">▣ Smart Feed</button>
            <button class="add-channel-button" id="refresh-all-channels-button"
                type="button" ${refreshInProgress ? "disabled" : ""}>
                ${refreshInProgress ? "Refreshing..." : "↻ Refresh All Channels"}
            </button>
        </div>
        <div class="channel-last-refresh">
            ${getLastRefreshText() ? escapeHtml(getLastRefreshText()) : "Not refreshed yet"}
        </div>
        <div class="channel-list">
            ${channels.map(channel => createChannelCard(channel)).join("")}
        </div>
    `;

    setupAddChannelButton();
    setupChannelButtons();
    setupRefreshAllChannelsButton();
    document.getElementById("channels-smart-feed")?.addEventListener("click", () => navigateToPage("feed"));
    updateNewVideoCount();
}

function createChannelCard(channel) {
    const thumbnail = channel.thumbnail
        ? `<img class="channel-thumbnail" src="${escapeHtml(channel.thumbnail)}" alt="">`
        : "";
    const status = channel.verified ? "✓ Connected to YouTube" : "Not connected";
    const stats = getChannelStats(channel.id);

    return `
        <article class="channel-card channel-card-expanded" data-channel-id="${escapeHtml(channel.id)}">
            <div class="channel-card-header">
                ${thumbnail}
                <div class="channel-card-info">
                    <h3 class="channel-card-name">${escapeHtml(channel.name)}</h3>
                    <p class="channel-card-url">${escapeHtml(status)}</p>
                    ${channel.lastUpdated ? `<p class="channel-card-url">
                        Checked: ${escapeHtml(channel.lastUpdated)}</p>` : ""}
                </div>
            </div>
            <div class="channel-stats" aria-label="Stored videos for ${escapeHtml(channel.name)}">
                <div><strong>${stats.total}</strong><span>Videos</span></div>
                <div><strong>${stats.new}</strong><span>New</span></div>
                <div><strong>${stats.saved}</strong><span>Saved</span></div>
                <div><strong>${stats.watched}</strong><span>Watched</span></div>
            </div>
            <div class="channel-card-actions channel-card-buttons">
                <button class="channel-feed-button" type="button" aria-label="Open ${escapeHtml(channel.name)} in Smart Feed">Smart Feed</button>
                <button class="channel-view-button" type="button"
                    aria-label="View stored videos from ${escapeHtml(channel.name)}">View videos</button>
                <button class="channel-delete-button" type="button"
                    aria-label="Delete followed channel ${escapeHtml(channel.name)}">Delete channel</button>
            </div>
        </article>
    `;
}

function setupAddChannelButton() {
    document.querySelectorAll(".add-channel-button")
        .forEach(button => {
            if (
                button.id ===
                "refresh-all-channels-button"
            ) {
                return;
            }

            button.addEventListener(
                "click",
                showAddChannelForm
            );
        });
}

function setupRefreshAllChannelsButton() {
    document
        .getElementById("refresh-all-channels-button")
        ?.addEventListener("click", () => {
            refreshAllChannels(false);
        });
}

function setupChannelButtons() {
    document.querySelectorAll(".channel-card")
        .forEach(card => {
            const channelId =
                card.getAttribute("data-channel-id");

            card.querySelector(".channel-view-button")
                ?.addEventListener("click", () => openChannelVideos(channelId));
            card.querySelector(".channel-feed-button")?.addEventListener("click", () => {
                smartFeedPrefs.channelId = channelId;
                saveSmartFeedPrefs();
                navigateToPage("feed");
            });

            card.querySelector(".channel-delete-button")
                ?.addEventListener("click", () => {
                    deleteChannel(channelId);
                });
        });
}

function deleteChannel(channelId) {
    if (!canModifyLibrary()) return;
    const channel = channels.find(
        item => item.id === channelId
    );

    if (!channel) return;

    if (
        !confirm(
            `Delete "${channel.name}" from your followed channels?`
        )
    ) {
        return;
    }

    channels = channels.filter(
        item => item.id !== channelId
    );

    // Keep the video's history. Only the channel follow is removed.
    if (activeChannelId === channelId) activeChannelId = null;
    saveChannels();
    updateContent();
}

/* =========================================
   ADD CHANNEL FORM
   ========================================= */

function showAddChannelForm() {
    const videoList =
        document.querySelector(".video-list");

    if (!videoList) return;

    if (document.querySelector(".channel-form")) {
        return;
    }

    const existingApiKey = getApiKey();

    const apiKeyHtml = existingApiKey
        ? `
            <p class="api-key-saved">
                ✓ API key already saved
            </p>
          `
        : `
            <label>
                YouTube API key

                <input type="password"
                       id="youtube-api-key-input"
                       placeholder="Paste your API key here"
                       autocomplete="off">
            </label>
          `;

    const form = document.createElement("div");
    form.className = "channel-form";

    form.innerHTML = `
        <h3>Add YouTube Channel</h3>

        <label>
            YouTube channel URL

            <input type="url"
                   id="channel-url-input"
                   placeholder="https://youtube.com/@channel"
                   autocomplete="off">
        </label>

        ${apiKeyHtml}

        <div class="form-actions">
            <button class="form-button form-save-button"
                    id="save-channel-button"
                    type="button">
                Find channel
            </button>

            <button class="form-button form-cancel-button"
                    id="cancel-channel-button"
                    type="button">
                Cancel
            </button>
        </div>
    `;

    videoList.prepend(form);

    document
        .getElementById("save-channel-button")
        ?.addEventListener(
            "click",
            connectYouTubeChannel
        );

    document
        .getElementById("cancel-channel-button")
        ?.addEventListener(
            "click",
            updateContent
        );
}

/* =========================================
   CONNECT CHANNEL
   ========================================= */

async function connectYouTubeChannel() {
    if (!canModifyLibrary()) return;
    const urlInput =
        document.getElementById("channel-url-input");

    const apiKeyInput =
        document.getElementById("youtube-api-key-input");

    if (!urlInput) return;

    const url = urlInput.value.trim();

    if (!url) {
        alert("Please enter a YouTube channel URL.");
        return;
    }

    const parsedUrl = parseYouTubeChannelUrl(url);

    if (!parsedUrl.valid) {
        alert("Please enter a valid YouTube channel URL.");
        return;
    }

    if (!getApiKey() && apiKeyInput) {
        const enteredKey = apiKeyInput.value.trim();

        if (!enteredKey) {
            alert("Please enter your YouTube API key.");
            return;
        }

        saveApiKey(enteredKey);
    }

    const button =
        document.getElementById("save-channel-button");

    if (button) {
        button.disabled = true;
        button.textContent = "Connecting...";
    }

    try {
        const channel =
            await findYouTubeChannel(parsedUrl);

        const latestVideos =
            await loadChannelVideos(channel);

        const channelId = channel.id;

        const channelName =
            channel?.snippet?.title ||
            "YouTube Channel";

        const uploadsPlaylistId =
            channel?.contentDetails
                ?.relatedPlaylists
                ?.uploads || "";

        const channelUrl =
            `https://www.youtube.com/channel/${channelId}`;

        const newChannel = {
            id: channelId,
            name: channelName,
            url: channelUrl,
            originalUrl: url,
            uploadsPlaylistId,
            thumbnail:
                channel?.snippet?.thumbnails?.medium?.url ||
                channel?.snippet?.thumbnails?.default?.url ||
                "",
            verified: true,
            addedAt: new Date().toISOString(),
            lastUpdated: formatDateTime(new Date())
        };

        const existingIndex = channels.findIndex(
            item => item.id === channelId
        );

        if (existingIndex >= 0) {
            channels[existingIndex] = {
                ...channels[existingIndex],
                ...newChannel
            };
        } else {
            channels.push(newChannel);
        }

        saveChannels();

        // On the first follow, existing uploads form a baseline (not NEW).
        // Reconnecting an already followed channel can discover new uploads.
        const firstTimeFollowing = existingIndex === -1;
        let newVideosFound = 0;

        latestVideos.forEach(video => {
            const existed = videos.some(
                existing => existing.id === video.id
            );

            mergeVideo(video, !firstTimeFollowing);

            if (!existed && !firstTimeFollowing) newVideosFound++;
        });

        sortVideos();
        saveVideos();
        saveLastRefreshTime();

        currentPage = "new";
        saveCurrentPage();

        updateNavigation();
        updateContent();

        const summary = firstTimeFollowing
            ? `${latestVideos.length} recent videos loaded.\n` +
              `Older uploads are under Recent videos, not NEW.\n` +
              `Future uploads will be marked NEW.`
            : `${latestVideos.length} recent videos loaded.\n` +
              `${newVideosFound} new videos found.`;

        alert(`Connected to "${channelName}".\n\n${summary}`);
    } catch (error) {
        console.log(
            "Connect channel error:",
            error
        );

        showYouTubeError(error);
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = "Find channel";
        }
    }
}

/* =========================================
   ERROR MESSAGE
   ========================================= */

function showYouTubeError(error) {
    if (error.message === "NO_API_KEY") {
        alert("No YouTube API key has been saved.");
        return;
    }

    if (error.message === "CHANNEL_NOT_FOUND") {
        alert("The YouTube channel could not be found.");
        return;
    }

    if (error.message === "quotaExceeded") {
        alert("The YouTube API daily quota has been exceeded.");
        return;
    }

    if (error.message === "keyInvalid") {
        removeApiKey();
        alert(
            "The YouTube API key was invalid and has been removed."
        );
        return;
    }

    if (error.message === "forbidden") {
        alert(
            "YouTube rejected the API request. " +
            "Please check the API key and YouTube Data API v3."
        );
        return;
    }

    console.log("YouTube error:", error);

    alert(
        "Something went wrong while connecting to YouTube."
    );
}

/* =========================================
   START APPLICATION
   ========================================= */

async function startApp() {
    // Important: malformed critical localStorage must never silently become an empty library.
    storageIntegrityIssue = detectStorageIntegrityIssue();
    videos = loadVideos();
    channels = loadChannels();
    watchQueue = loadWatchQueue();

    sortVideos();

    setupSearchNavigation();
    setupNavigation();
    setupSettingsButton();

    updateNavigation();
    updateContent();
    if (storageIntegrityIssue) {
        showStorageIntegrityWarning();
        return; // No automatic writes until a verified backup has been restored.
    }

    startAutomaticRefresh();

    await maybeAutoRefresh();
}

/* =========================================
   START
   ========================================= */

document.addEventListener(
    "DOMContentLoaded",
    startApp
);
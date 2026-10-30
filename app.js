/* =========================================
   MY YOUTUBE
   Main application logic
   Version 1.1

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
function durationSecondsForSorting(value) {
    const text = String(value || "").trim();
    const hours = /(?:^|\s)(\d+)h(?:\s|$)/.exec(text);
    const minutes = /(?:^|\s)(\d+)m(?:\s|$)/.exec(text);
    const seconds = /(?:^|\s)(\d+)s(?:\s|$)/.exec(text);
    if (!hours && !minutes && !seconds) return null;
    return Number(hours?.[1] || 0) * 3600 +
        Number(minutes?.[1] || 0) * 60 + Number(seconds?.[1] || 0);
}
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

let videos = [];
let channels = [];
let currentPage = localStorage.getItem(PAGE_STORAGE_KEY) || "home";
let refreshInProgress = false;

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

function pacificQuotaDay(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Los_Angeles",
        year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(date);
    const get = type => parts.find(part => part.type === type)?.value || "00";
    return `${get("year")}-${get("month")}-${get("day")}`;
}

function getLocalApiUsage() {
    const day = pacificQuotaDay();
    const initial = { day, searches: 0, other: 0 };
    try {
        const previous = JSON.parse(localStorage.getItem(API_USAGE_KEY) || "null");
        if (!previous || previous.day !== day) return initial;
        const valid = value => Number.isSafeInteger(value) && value >= 0;
        return {
            day,
            searches: valid(previous.searches) ? previous.searches : 0,
            other: valid(previous.other) ? previous.other : 0
        };
    } catch (error) {
        return initial;
    }
}

function recordLocalApiCall(endpoint) {
    const count = getLocalApiUsage();
    if (endpoint === "search") count.searches += 1;
    else count.other += 1;
    try {
        localStorage.setItem(API_USAGE_KEY, JSON.stringify(count));
    } catch (error) {
        // Failed local tracking must never interrupt YouTube requests.
        console.log("Could not save local API usage.", error);
    }
}

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
   STORAGE
   ========================================= */

function loadVideos() {
    const saved = localStorage.getItem(VIDEO_STORAGE_KEY);
    if (!saved) return [];

    try {
        const parsed = JSON.parse(saved);
        if (!Array.isArray(parsed)) return [];

        // Older videos from before NEW tracking are treated as existing,
        // so they do not suddenly appear as brand-new.
        return parsed.map(video => ({
            ...video,
            watched: Boolean(video.watched),
            saved: Boolean(video.saved),
            downloaded: Boolean(video.downloaded),
            hidden: Boolean(video.hidden),
            isNew: Boolean(video.isNew),
            firstSeenAt: video.firstSeenAt || ""
        }));
    } catch (error) {
        console.log("Could not load videos.", error);
        return [];
    }
}

function saveVideos() {
    localStorage.setItem(VIDEO_STORAGE_KEY, JSON.stringify(videos));
}

function loadChannels() {
    const saved = localStorage.getItem(CHANNEL_STORAGE_KEY);
    if (!saved) return [];

    try {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.log("Could not load channels.", error);
        return [];
    }
}

function saveChannels() {
    localStorage.setItem(CHANNEL_STORAGE_KEY, JSON.stringify(channels));
}

function saveCurrentPage() {
    localStorage.setItem(PAGE_STORAGE_KEY, currentPage);
}

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

function loadSavedSearches() {
    try {
        const stored = JSON.parse(localStorage.getItem(SAVED_SEARCHES_KEY) || "[]");
        if (!Array.isArray(stored)) return [];
        return stored.filter(item => {
            const mins = Number(item?.minMinutes);
            return item && typeof item.id === "string" &&
                typeof item.query === "string" && Boolean(item.query.trim()) &&
                Number.isInteger(mins) && mins >= 1 && mins <= 600;
        }).map(item => ({
            id: item.id,
            query: item.query.trim().slice(0, 150),
            minMinutes: Number(item.minMinutes),
            resultLimit: item.resultLimit === 20 ? 20 : 10,
            period: normalizeSearchPeriod(item.period),
            searchDepth: normalizeSearchDepth(item.searchDepth)
        }));
    } catch (error) {
        console.log("Could not load saved searches.", error);
        return [];
    }
}

function saveSavedSearches() {
    localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(savedSearches));
}

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

// The Home overview is the first tab. Existing pages stay in their usual order.
// Keep this programmatic so previous index.html layouts and saved data work.
function setupSearchNavigation() {
    const navigation = document.querySelector(".bottom-navigation");
    if (!navigation) return;

    if (!navigation.querySelector("#home-nav-button")) {
        const home = document.createElement("button");
        home.id = "home-nav-button";
        home.className = "nav-button";
        home.type = "button";
        home.innerHTML = '<span class="nav-icon" aria-hidden="true">⌂</span><span>Home</span>';
        navigation.prepend(home);
    }

    if (!navigation.querySelector("#search-nav-button")) {
        const search = document.createElement("button");
        search.id = "search-nav-button";
        search.className = "nav-button";
        search.type = "button";
        search.innerHTML = '<span class="nav-icon" aria-hidden="true">⌕</span><span>Search</span>';
        navigation.appendChild(search);
    }
    navigation.style.gridTemplateColumns = "repeat(6, minmax(0, 1fr))";
}

/* =========================================
   NAVIGATION
   ========================================= */

const APP_PAGES = ["home", "new", "saved", "watched", "channels", "search"];

function navigateToPage(page) {
    if (!APP_PAGES.includes(page)) return;
    // Always open the channel list when arriving through the main navigation.
    activeChannelId = null;
    activeChannelVideoFilter = "all";
    currentPage = page;
    saveCurrentPage();
    updateNavigation();
    updateContent();
    window.scrollTo(0, 0);
}

function setupNavigation() {
    document.querySelectorAll(".nav-button").forEach((button, index) => {
        const page = APP_PAGES[index];
        if (!page) return;
        button.dataset.appPage = page;
        button.addEventListener("click", () => navigateToPage(page));
    });
}

function updateNavigation() {
    document.querySelectorAll(".nav-button").forEach(button => {
        const active = button.dataset.appPage === currentPage;
        button.classList.toggle("active", active);
        if (active) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
    });
}

/* =========================================
   SETTINGS
   ========================================= */

function setupSettingsButton() {
    const button = document.querySelector(".settings-button");
    if (button) button.addEventListener("click", openSettings);
}

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

/* =========================================
   BACKUP & RESTORE
   - Local JSON file; no server or YouTube API calls.
   - API key is excluded by default.
   - Restore replaces this device's saved app data after confirmation.
   ========================================= */

function createMyYouTubeBackup(includeApiKey = false) {
    const data = {
        videos,
        channels,
        savedSearches,
        searchPreferences,
        currentPage,
        lastRefresh: getLastRefreshTime()
    };

    if (includeApiKey) data.apiKey = getApiKey();

    return {
        app: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        data
    };
}

function downloadMyYouTubeBackup() {
    try {
        const includeApiKey = Boolean(
            document.getElementById("backup-include-api-key")?.checked
        );
        const backup = createMyYouTubeBackup(includeApiKey);
        const blob = new Blob([JSON.stringify(backup, null, 2)], {
            type: "application/json"
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const date = new Date().toISOString().slice(0, 10);
        link.href = url;
        link.download = `my-youtube-backup-${date}.json`;
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        link.remove();
        // Some mobile browsers need a little time to start the download.
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
        console.error("Backup download failed:", error);
        alert("Could not create the backup. Please try again.");
    }
}

function checkBackupText(value, name, maxLength = 2000) {
    if (typeof value !== "string" || value.length > maxLength) {
        throw new Error(`Invalid ${name} in backup.`);
    }
    return value;
}

function checkOptionalBackupText(value, name, maxLength = 2000) {
    if (value === undefined || value === null) return "";
    return checkBackupText(value, name, maxLength);
}

function validateMyYouTubeBackup(backup) {
    if (!backup || typeof backup !== "object" ||
        backup.app !== BACKUP_FORMAT || backup.version !== BACKUP_VERSION ||
        !backup.data || typeof backup.data !== "object" ||
        Array.isArray(backup.data)) {
        throw new Error("This is not a supported My YouTube backup file.");
    }

    const d = backup.data;
    if (!Array.isArray(d.videos) || d.videos.length > 15000 ||
        !Array.isArray(d.channels) || d.channels.length > 1000 ||
        !Array.isArray(d.savedSearches) || d.savedSearches.length > 1000) {
        throw new Error("The backup contains missing or oversized lists.");
    }

    const restoredVideos = d.videos.map(item => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
            throw new Error("Invalid video entry in backup.");
        }
        const id = checkBackupText(item.id, "video ID", 150);
        if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
            throw new Error("A video has an invalid YouTube ID.");
        }
        const thumbnail = checkOptionalBackupText(
            item.thumbnail, "thumbnail URL"
        );
        return {
            id,
            title: checkOptionalBackupText(item.title, "video title"),
            channel: checkOptionalBackupText(item.channel, "video channel"),
            channelId: checkOptionalBackupText(item.channelId, "video channel ID", 150),
            date: checkOptionalBackupText(item.date, "video date", 100),
            publishedAt: checkOptionalBackupText(item.publishedAt, "publish date", 100),
            duration: checkOptionalBackupText(item.duration, "video duration", 100),
            thumbnail: /^https:\/\//i.test(thumbnail) ? thumbnail : "",
            youtubeUrl: `https://www.youtube.com/watch?v=${id}`,
            firstSeenAt: checkOptionalBackupText(item.firstSeenAt, "first seen date", 100),
            watched: Boolean(item.watched),
            saved: Boolean(item.saved),
            downloaded: Boolean(item.downloaded),
            hidden: Boolean(item.hidden),
            isNew: Boolean(item.isNew)
        };
    });

    const restoredChannels = d.channels.map(item => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
            throw new Error("Invalid channel entry in backup.");
        }
        const id = checkBackupText(item.id, "channel ID", 150);
        if (!id) throw new Error("A channel is missing its ID.");
        return {
            id,
            name: checkOptionalBackupText(item.name, "channel name"),
            url: checkOptionalBackupText(item.url, "channel URL"),
            originalUrl: checkOptionalBackupText(item.originalUrl, "original URL"),
            uploadsPlaylistId: checkOptionalBackupText(
                item.uploadsPlaylistId, "uploads playlist ID", 150
            ),
            thumbnail: checkOptionalBackupText(item.thumbnail, "channel thumbnail"),
            lastUpdated: checkOptionalBackupText(item.lastUpdated, "channel update", 100),
            addedAt: checkOptionalBackupText(item.addedAt, "channel added date", 100),
            verified: Boolean(item.verified)
        };
    });

    const restoredSearches = d.savedSearches.map(item => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
            throw new Error("Invalid saved search in backup.");
        }
        const id = checkBackupText(item.id, "saved search ID", 150);
        const query = checkBackupText(item.query, "saved search words", 150).trim();
        if (!id || !query || !Number.isInteger(item.minMinutes) ||
            item.minMinutes < 1 || item.minMinutes > 600 ||
            (item.resultLimit !== 10 && item.resultLimit !== 20)) {
            throw new Error("A saved search has invalid settings.");
        }
        return {
            id, query, minMinutes: item.minMinutes,
            resultLimit: item.resultLimit,
            period: normalizeSearchPeriod(item.period),
            searchDepth: normalizeSearchDepth(item.searchDepth)
        };
    });

    const prefs = d.searchPreferences;
    if (!prefs || typeof prefs !== "object" || Array.isArray(prefs) ||
        !Number.isInteger(prefs.minMinutes) || prefs.minMinutes < 1 ||
        prefs.minMinutes > 600 ||
        (prefs.resultLimit !== 10 && prefs.resultLimit !== 20)) {
        throw new Error("Invalid search preferences in backup.");
    }
    const restoredPreferences = {
        query: checkBackupText(prefs.query, "search words", 150),
        minMinutes: prefs.minMinutes,
        resultLimit: prefs.resultLimit,
        period: normalizeSearchPeriod(prefs.period),
        searchDepth: normalizeSearchDepth(prefs.searchDepth)
    };

    const allowedPages = ["home", "new", "saved", "watched", "channels", "search"];
    const page = allowedPages.includes(d.currentPage) ? d.currentPage : "new";
    const lastRefresh = d.lastRefresh;
    if (typeof lastRefresh !== "number" ||
        !Number.isFinite(lastRefresh) || lastRefresh < 0) {
        throw new Error("Invalid last refresh time in backup.");
    }

    const hasApiKey = Object.prototype.hasOwnProperty.call(d, "apiKey");
    const apiKey = hasApiKey
        ? checkBackupText(d.apiKey, "API key", 1000)
        : null;

    return {
        videos: restoredVideos,
        channels: restoredChannels,
        savedSearches: restoredSearches,
        searchPreferences: restoredPreferences,
        currentPage: page,
        lastRefresh,
        hasApiKey,
        apiKey
    };
}

function applyMyYouTubeBackup(data) {
    const writes = [
        [VIDEO_STORAGE_KEY, JSON.stringify(data.videos)],
        [CHANNEL_STORAGE_KEY, JSON.stringify(data.channels)],
        [SAVED_SEARCHES_KEY, JSON.stringify(data.savedSearches)],
        [SEARCH_PREFS_KEY, JSON.stringify(data.searchPreferences)],
        [PAGE_STORAGE_KEY, data.currentPage],
        [LAST_REFRESH_KEY, String(data.lastRefresh)]
    ];
    if (data.hasApiKey) writes.push([API_KEY_STORAGE_KEY, data.apiKey]);

    // Keep a copy so a storage/quota error does not silently lose the old data.
    const previous = writes.map(([key]) => [key, localStorage.getItem(key)]);
    try {
        for (const [key, value] of writes) localStorage.setItem(key, value);
    } catch (error) {
        for (const [key, oldValue] of previous) {
            try {
                if (oldValue === null) localStorage.removeItem(key);
                else localStorage.setItem(key, oldValue);
            } catch (rollbackError) {
                console.error("Could not roll back storage:", rollbackError);
            }
        }
        throw new Error("Could not save restored data. Existing data was kept where possible.");
    }

    videos = data.videos;
    channels = data.channels;
    activeChannelId = null;
    activeChannelVideoFilter = "all";
    savedSearches = data.savedSearches;
    editingSavedSearchId = null;
    searchPreferencesBeforeEdit = null;
    searchPreferences = data.searchPreferences;
    currentPage = data.currentPage;
    searchResults = [];
    searchWasRun = false;
    searchResultMessage = "Enter a topic and tap Search YouTube.";
    // Old cached searches should not reappear after restoring another backup.
    clearSearchCache();
    sortVideos();
    updateNavigation();
    updateContent();
}

async function handleMyYouTubeRestore(event) {
    const input = event.target;
    const file = input?.files?.[0];
    if (!file) return;
    input.value = "";

    if (refreshInProgress || searchInProgress) {
        alert("Finish the current refresh or search before restoring a backup.");
        return;
    }
    if (file.size > 10 * 1024 * 1024) {
        alert("This backup file is too large (maximum 10 MB).");
        return;
    }

    try {
        const backup = JSON.parse(await file.text());
        const data = validateMyYouTubeBackup(backup);
        const keyNotice = data.hasApiKey
            ? "The backup also contains an API key, which will replace the one on this device."
            : "Your current API key will remain unchanged.";
        const message =
            `Restore this backup?\n\n` +
            `${data.channels.length} channels, ${data.savedSearches.length} saved searches, ` +
            `${data.videos.length} videos (including Watched/Saved statuses).\n\n` +
            `This will REPLACE the existing app data on this device. ` +
            `Download a backup of your current data first.\n\n${keyNotice}`;
        if (!confirm(message)) return;

        applyMyYouTubeBackup(data);
        closeSettings();
        alert("Backup restored successfully. Your channels, searches and video statuses are ready.");
    } catch (error) {
        console.error("Could not restore My YouTube backup:", error);
        alert(`Restore failed: ${error.message || "Invalid backup file."}`);
    }
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

function renderHomePage() {
    const videoList = document.querySelector(".video-list");
    const sectionTitle = document.querySelector(".section-header h2");
    if (!videoList || !sectionTitle) return;
    sectionTitle.textContent = "Home";
    document.getElementById("refresh-page-button")?.remove();

    const newVideos = videos.filter(v => !v.hidden && v.isNew && !v.watched);
    const savedCount = videos.filter(v => !v.hidden && v.saved).length;
    const watchedCount = videos.filter(v => !v.hidden && v.watched).length;
    const recent = newVideos.length
        ? newVideos.slice(0, 2)
        : videos.filter(v => !v.hidden && !v.watched && channels.some(c => c.id === v.channelId)).slice(0, 2);
    const recentHeading = newVideos.length ? "New uploads" : "Recent channel videos";
    const refreshText = getLastRefreshText() || "Not refreshed yet";

    const overviewItems = [
        { page: "new", icon: "●", label: "New", count: newVideos.length },
        { page: "saved", icon: "☆", label: "Saved", count: savedCount },
        { page: "watched", icon: "✓", label: "Watched", count: watchedCount },
        { page: "channels", icon: "▣", label: "Channels", count: channels.length }
    ];

    videoList.innerHTML = `
        <section class="home-hero" aria-label="Your YouTube overview">
            <div class="home-eyebrow">YOUR PERSONAL VIDEO SPACE</div>
            <h3>Everything in one place.</h3>
            <p>Keep up with your channels, saved videos and searches.</p>
            <div class="home-refresh-status">${escapeHtml(refreshText)}</div>
        </section>
        <section class="home-stats" aria-label="Your video statistics">
            ${overviewItems.map(item => `
                <button class="home-stat" type="button" data-go-page="${item.page}"
                        aria-label="Open ${item.label}: ${item.count}">
                    <span class="home-stat-top"><span aria-hidden="true">${item.icon}</span> ${item.label}</span>
                    <strong>${item.count}</strong>
                    <span class="home-stat-open">View →</span>
                </button>
            `).join("")}
        </section>
        <section class="home-panel" aria-labelledby="home-actions-title">
            <div class="home-section-title"><h3 id="home-actions-title">Quick actions</h3></div>
            <div class="home-actions">
                <button type="button" class="home-primary-action" id="home-refresh" ${refreshInProgress || !channels.length ? "disabled" : ""}>
                    ↻ ${refreshInProgress ? "Refreshing..." : "Refresh channels"}
                </button>
                <button type="button" class="home-secondary-action" data-go-page="search">⌕ Search YouTube</button>
            </div>
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
            ` : `<p class="home-empty">No saved searches yet. Save one from the Search tab.</p>`}
        </section>
        <section class="home-panel" aria-labelledby="home-videos-title">
            <div class="home-section-title">
                <h3 id="home-videos-title">${recentHeading}</h3>
                <button type="button" class="home-text-action" data-go-page="new">See all →</button>
            </div>
            ${recent.length ? `<div class="home-preview-videos">${recent.map(video => createVideoCard(video)).join("")}</div>`
                : `<p class="home-empty">New videos from your followed channels will appear here.</p>`}
        </section>
    `;

    videoList.querySelectorAll("[data-go-page]").forEach(button => {
        button.addEventListener("click", () => navigateToPage(button.dataset.goPage));
    });
    videoList.querySelectorAll("[data-run-search]").forEach(button => {
        button.addEventListener("click", () => {
            if (searchInProgress) return;
            const id = button.dataset.runSearch;
            navigateToPage("search");
            handleRunSavedSearch(id);
        });
    });
    document.getElementById("home-refresh")?.addEventListener("click", () => {
        refreshAllChannels(false);
    });
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

    const primaryCards = filteredPrimary.map(video => createVideoCard(video)).join("");
    const recentCards = filteredRecent.map(video => createVideoCard(video)).join("");
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
}

function setupLibraryControls() {
    if (!LIBRARY_PAGES.includes(currentPage)) return;
    const prefs = libraryViewPrefs[currentPage];
    const search = document.getElementById("library-filter-query");
    const channel = document.getElementById("library-filter-channel");
    const sort = document.getElementById("library-filter-sort");
    const compact = document.getElementById("library-compact-toggle");
    const clear = document.getElementById("library-clear-filters");

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

function updateContent() {
    const videoList = document.querySelector(".video-list");
    const sectionTitle = document.querySelector(".section-header h2");
    if (!videoList || !sectionTitle) return;

    if (currentPage === "home") {
        renderHomePage();
        return;
    }
    if (currentPage === "channels") {
        renderChannelsPage();
        return;
    }
    if (currentPage === "search") {
        renderSearchPage();
        updateNewVideoCount();
        return;
    }
    if (!LIBRARY_PAGES.includes(currentPage)) return;

    const names = { new: "New Videos", saved: "Saved Videos", watched: "Watched Videos" };
    sectionTitle.textContent = names[currentPage];
    addRefreshButton();

    const prefs = libraryViewPrefs[currentPage];
    const activeVideos = getVisibleVideos();
    const recent = currentPage === "new"
        ? videos.filter(video => !video.hidden && !video.isNew && !video.watched &&
            channels.some(channel => channel.id === video.channelId)).slice(0, 30)
        : [];
    const channelNames = [...new Set([...activeVideos, ...recent]
        .map(video => video.channel || "Unknown channel"))]
        .sort((a, b) => a.localeCompare(b));
    // A deleted channel filter should not silently hide all videos forever.
    if (prefs.channel && !channelNames.includes(prefs.channel)) {
        prefs.channel = "";
        saveLibraryViewPrefs();
    }

    videoList.innerHTML = `
        <section class="library-tools" aria-label="Video library controls">
            <div class="library-tools-heading">
                <h3>My video library</h3>
                <span>Search and organise videos already on this device</span>
            </div>
            <label for="library-filter-query">Find a video
                <input id="library-filter-query" type="search" maxlength="150"
                    placeholder="Video title or channel"
                    value="${escapeHtml(prefs.query)}" autocomplete="off">
            </label>
            <div class="library-filter-grid">
                <label for="library-filter-channel">Channel
                    <select id="library-filter-channel">
                        <option value="">All channels</option>
                        ${channelNames.map(name => `<option value="${escapeHtml(name)}"
                            ${name === prefs.channel ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}
                    </select>
                </label>
                <label for="library-filter-sort">Order
                    <select id="library-filter-sort">
                        <option value="newest" ${prefs.sort === "newest" ? "selected" : ""}>Newest first</option>
                        <option value="oldest" ${prefs.sort === "oldest" ? "selected" : ""}>Oldest first</option>
                        <option value="longest" ${prefs.sort === "longest" ? "selected" : ""}>Longest first</option>
                        <option value="shortest" ${prefs.sort === "shortest" ? "selected" : ""}>Shortest first</option>
                    </select>
                </label>
            </div>
            <div class="library-tool-actions">
                <button id="library-compact-toggle" type="button"
                    aria-pressed="${prefs.compact}">
                    ${prefs.compact ? "▦ Show thumbnails" : "☷ Compact list"}
                </button>
                <button id="library-clear-filters" type="button">Clear filters</button>
            </div>
            <p id="library-results-summary" role="status" aria-live="polite"></p>
        </section>
        <div id="library-results" class="library-results"></div>
    `;
    setupLibraryControls();
    renderLibraryResults();
    updateNewVideoCount();
}

function updateNewVideoCount() {
    const count = videos.filter(
        video => !video.hidden && video.isNew && !video.watched
    ).length;

    // Update the counter already present in index.html.
    const headerCount = document.querySelector(".video-count");

    if (headerCount) {
        headerCount.textContent = `${count} new`;
        headerCount.style.display = currentPage === "new" ? "" : "none";
    }

    // The New tab is selected by page name, not its position in navigation.
    const newButton = document.querySelector('.nav-button[data-app-page="new"]');
    const newLabel = newButton?.querySelector("span:not(.nav-icon)");

    if (newLabel) {
        newLabel.textContent = count > 0 ? `New (${count})` : "New";
    }
}

/* =========================================
   REFRESH BUTTON
   ========================================= */

function addRefreshButton() {
    const sectionHeader = document.querySelector(".section-header");
    if (!sectionHeader) return;

    const existing = document.getElementById("refresh-page-button");

    if (currentPage === "channels") {
        existing?.remove();
        return;
    }

    if (existing) return;

    const button = document.createElement("button");
    button.id = "refresh-page-button";
    button.className = "refresh-button";
    button.type = "button";
    button.textContent = "↻ Refresh";

    button.addEventListener("click", () => {
        refreshAllChannels(false);
    });

    sectionHeader.appendChild(button);
}

/* =========================================
   VIDEO CARD
   ========================================= */

function getYouTubeVideoLink(videoId) {
    // YouTube video IDs have 11 URL-safe characters. Use the canonical URL
    // rather than a URL from storage so links cannot point to other sites.
    const id = String(videoId ?? "").trim();
    return /^[A-Za-z0-9_-]{11}$/.test(id)
        ? `https://www.youtube.com/watch?v=${id}`
        : "";
}

function createVideoCard(video) {
    const videoLink = getYouTubeVideoLink(video.id);
    const watchedText = video.watched ? "✓ Watched" : "○ Watched";
    const savedText = video.saved ? "★ Saved" : "☆ Save";
    const downloadedText = video.downloaded
        ? "✓ Downloaded"
        : "↓ Download";

    const thumbnail = video.thumbnail
        ? `
            <img class="thumbnail-image"
                 src="${escapeHtml(video.thumbnail)}"
                 alt=""
                 loading="lazy">
          `
        : `
            <div class="thumbnail-placeholder">VIDEO</div>
          `;

    const newBadge = video.isNew && !video.watched
        ? `
            <span style="
                position:absolute;
                top:8px;
                left:8px;
                z-index:2;
                padding:4px 8px;
                border-radius:999px;
                background:#2563eb;
                color:#fff;
                font-size:11px;
                font-weight:700;
                letter-spacing:.5px;
            ">NEW</span>
          `
        : "";

    return `
        <article class="video-card"
                 data-video-id="${escapeHtml(video.id)}">

            <div class="thumbnail" style="position:relative;">
                ${thumbnail}
                ${newBadge}
            </div>

            <div class="video-info">
                <h3>${escapeHtml(video.title)}</h3>

                <p class="channel-name">
                    ${escapeHtml(video.channel)}
                </p>

                <p class="video-date">
                    ${escapeHtml(video.date)}
                    ${
                        video.duration
                            ? ` • ${escapeHtml(video.duration)}`
                            : ""
                    }
                </p>

                ${videoLink ? `
                    <div class="video-link-row" style="margin:12px 0;min-width:0;">
                        <div style="font-size:12px;color:#94a3b8;margin-bottom:5px;">
                            Video link
                        </div>
                        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-width:0;">
                            <a class="video-link" href="${escapeHtml(videoLink)}"
                               target="_blank" rel="noopener noreferrer"
                               style="flex:1 1 180px;min-width:0;color:#93c5fd;font-size:12px;
                                      overflow-wrap:anywhere;word-break:break-word;">
                                ${escapeHtml(videoLink)}
                            </a>
                            <button class="action-button copy-link-button" type="button"
                                    aria-label="Copy video link"
                                    style="flex:0 0 auto;white-space:nowrap;">
                                ⧉ Copy link
                            </button>
                        </div>
                    </div>` : ""}

                <div class="video-actions">
                    <button class="action-button watch-button"
                            type="button">
                        ▶ Watch
                    </button>

                    <button class="action-button watched-button ${
                        video.watched ? "is-active" : ""
                    }"
                            type="button">
                        ${watchedText}
                    </button>
                </div>

                <div class="video-actions secondary-actions">
                    <button class="action-button download-button ${
                        video.downloaded ? "is-active" : ""
                    }"
                            type="button">
                        ${downloadedText}
                    </button>

                    <button class="action-button save-button ${
                        video.saved ? "is-active" : ""
                    }"
                            type="button">
                        ${savedText}
                    </button>
                </div>
                <div class="video-hide-row">
                    <button class="action-button video-hide-button" type="button"
                            aria-label="Hide this video from your library">
                        🙈 Hide video
                    </button>
                </div>
            </div>
        </article>
    `;
}

/* =========================================
   HTML SAFETY
   ========================================= */

function escapeHtml(text) {
    return String(text ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

/* =========================================
   VIDEO BUTTONS
   ========================================= */

function setupVideoButtons() {
    document.querySelectorAll(".video-card").forEach(card => {
        const videoId = card.getAttribute("data-video-id");

        card.querySelector(".watch-button")
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
    const video = getActionVideo(videoId, true);
    if (!video || video.hidden) return;
    video.hidden = true;
    // Keep NEW / Watched / Saved / Downloaded intact for a future restore.
    saveVideos();
    updateContent();
}

function toggleWatched(videoId) {
    const video = getActionVideo(videoId, true);
    if (!video) return;

    video.watched = !video.watched;

    // Once the user marks a video as watched, it is no longer NEW.
    if (video.watched) {
        video.isNew = false;
    }

    saveVideos();
    updateContent();
}

function toggleSaved(videoId) {
    const video = getActionVideo(videoId, true);
    if (!video) return;

    video.saved = !video.saved;
    saveVideos();
    updateContent();
}

function toggleDownloaded(videoId) {
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

function parseYouTubeDurationSeconds(isoDuration) {
    // YouTube's contentDetails.duration is ISO 8601, not plain text.
    const match = String(isoDuration || "").match(
        /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/
    );
    if (!match || !match.slice(1).some(Boolean)) return null;
    return Number(match[1] || 0) * 86400 +
        Number(match[2] || 0) * 3600 +
        Number(match[3] || 0) * 60 +
        Number(match[4] || 0);
}

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

function parseYouTubeChannelUrl(url) {
    let parsedUrl;

    try {
        parsedUrl = new URL(url);
    } catch (error) {
        return { valid: false, type: null, value: null };
    }

    const hostname = parsedUrl.hostname
        .toLowerCase()
        .replace(/^www\./, "");

    if (
        hostname !== "youtube.com" &&
        hostname !== "m.youtube.com"
    ) {
        return { valid: false, type: null, value: null };
    }

    const path = parsedUrl.pathname.replace(/\/+$/, "");

    if (path.startsWith("/@")) {
        return {
            valid: true,
            type: "handle",
            value: path.substring(1)
        };
    }

    if (path.startsWith("/channel/")) {
        return {
            valid: true,
            type: "id",
            value: path.substring("/channel/".length)
        };
    }

    if (path.startsWith("/user/")) {
        return {
            valid: true,
            type: "username",
            value: path.substring("/user/".length)
        };
    }

    return { valid: false, type: null, value: null };
}

/* =========================================
   YOUTUBE API REQUEST
   ========================================= */

async function youtubeApiRequest(endpoint, parameters) {
    const apiKey = getApiKey();

    if (!apiKey) {
        throw new Error("NO_API_KEY");
    }

    const url = new URL(
        `https://www.googleapis.com/youtube/v3/${endpoint}`
    );

    Object.entries(parameters).forEach(([key, value]) => {
        url.searchParams.set(key, value);
    });

    // Keep the existing working API-key method for now.
    // The key itself is protected by Google Cloud restrictions.
    url.searchParams.set("key", apiKey);

    // Count the actual outgoing request, including each pagination request.
    // Even unsuccessful/invalid YouTube API requests can use quota.
    recordLocalApiCall(endpoint);
    const response = await fetch(url.toString());

    let data;

    try {
        data = await response.json();
    } catch (error) {
        throw new Error("INVALID_API_RESPONSE");
    }

    if (!response.ok) {
        const reason =
            data?.error?.errors?.[0]?.reason ||
            data?.error?.message ||
            "UNKNOWN_API_ERROR";

        throw new Error(reason);
    }

    return data;
}

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

function formatYouTubeDate(dateString) {
    if (!dateString) return "";

    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}

function formatDateTime(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return "";
    }

    return date.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function getLastRefreshText() {
    const timestamp = getLastRefreshTime();
    if (!timestamp) return "";

    return `Last refreshed: ${formatDateTime(new Date(timestamp))}`;
}

/* =========================================
   DURATION
   ========================================= */

function formatDuration(isoDuration) {
    if (!isoDuration) return "";

    const match = isoDuration.match(
        /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/
    );

    if (!match) return "";

    const hours = Number(match[1] || 0);
    const minutes = Number(match[2] || 0);
    const seconds = Number(match[3] || 0);

    if (hours > 0) {
        return (
            `${hours}h ` +
            `${String(minutes).padStart(2, "0")}m`
        );
    }

    if (minutes > 0) {
        return seconds > 0
            ? `${minutes}m ${String(seconds).padStart(2, "0")}s`
            : `${minutes}m`;
    }

    return `${seconds}s`;
}

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
    if (channels.length === 0) return;
    if (!getApiKey()) return;

    const lastRefresh = getLastRefreshTime();
    const now = Date.now();

    if (now - lastRefresh < AUTO_REFRESH_INTERVAL) {
        return;
    }

    await refreshAllChannels(true);
}

function startAutomaticRefresh() {
    setInterval(() => {
        refreshAllChannels(true);
    }, AUTO_REFRESH_INTERVAL);
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

            card.querySelector(".channel-delete-button")
                ?.addEventListener("click", () => {
                    deleteChannel(channelId);
                });
        });
}

function deleteChannel(channelId) {
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
    videos = loadVideos();
    channels = loadChannels();

    sortVideos();

    setupSearchNavigation();
    setupNavigation();
    setupSettingsButton();

    updateNavigation();
    updateContent();

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
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
const SAVED_SEARCHES_KEY = "my-youtube-saved-searches";
const BACKUP_FORMAT = "my-youtube";
const BACKUP_VERSION = 1;

const AUTO_REFRESH_INTERVAL = 60 * 60 * 1000;

let videos = [];
let channels = [];
let currentPage = localStorage.getItem(PAGE_STORAGE_KEY) || "new";
let refreshInProgress = false;

// Search is user-initiated only. Preferences persist; results stay in memory.
let searchPreferences = loadSearchPreferences();
let savedSearches = loadSavedSearches();
let editingSavedSearchId = null;
let searchPreferencesBeforeEdit = null;
let searchResults = [];
let searchInProgress = false;
let searchResultMessage = "Enter a topic and tap Search YouTube.";
let searchWasRun = false;

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
    const defaults = { query: "", minMinutes: 40, resultLimit: 10 };
    try {
        const saved = JSON.parse(localStorage.getItem(SEARCH_PREFS_KEY) || "null");
        if (!saved || typeof saved !== "object") return defaults;
        const minutes = Number(saved.minMinutes);
        return {
            query: typeof saved.query === "string" ? saved.query.slice(0, 150) : "",
            minMinutes: Number.isInteger(minutes) && minutes >= 1 && minutes <= 600
                ? minutes : defaults.minMinutes,
            resultLimit: saved.resultLimit === 20 ? 20 : 10
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
   Each saved item stores search words, minimum minutes, and result count.
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
            resultLimit: item.resultLimit === 20 ? 20 : 10
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
    if (!query || !Number.isInteger(minutes) || minutes < 1 || minutes > 600) {
        alert("Enter search words and a minimum duration of 1–600 minutes.");
        return null;
    }
    return {
        query: query.slice(0, 150),
        minMinutes: minutes,
        resultLimit: limit === 20 ? 20 : 10
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
        item.resultLimit === preferences.resultLimit
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
        resultLimit: saved.resultLimit
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
        resultLimit: saved.resultLimit
    });
}

// Add a Search tab while leaving index.html and style.css untouched.
function setupSearchNavigation() {
    const navigation = document.querySelector(".bottom-navigation");
    if (!navigation || navigation.querySelector("#search-nav-button")) return;

    const button = document.createElement("button");
    button.id = "search-nav-button";
    button.className = "nav-button";
    button.type = "button";
    button.innerHTML = '<span class="nav-icon">⌕</span><span>Search</span>';
    navigation.appendChild(button);
    navigation.style.gridTemplateColumns = "repeat(5, minmax(0, 1fr))";
}

/* =========================================
   NAVIGATION
   ========================================= */

function setupNavigation() {
    const navButtons = document.querySelectorAll(".nav-button");

    navButtons.forEach((button, index) => {
        button.addEventListener("click", () => {
            const pages = ["new", "saved", "watched", "channels", "search"];
            if (!pages[index]) return;

            currentPage = pages[index];
            saveCurrentPage();
            updateNavigation();
            updateContent();
        });
    });
}

function updateNavigation() {
    const navButtons = document.querySelectorAll(".nav-button");
    navButtons.forEach(button => button.classList.remove("active"));

    const pageIndexes = {
        new: 0,
        saved: 1,
        watched: 2,
        channels: 3,
        search: 4
    };

    const activeButton = navButtons[pageIndexes[currentPage]];
    if (activeButton) activeButton.classList.add("active");
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

    modal.innerHTML = `
        <div class="settings-modal" role="dialog" aria-modal="true">
            <div class="settings-header">
                <div>
                    <h2>Settings</h2>
                    <p>My YouTube</p>
                </div>

                <button class="settings-close-button"
                        id="close-settings-button"
                        type="button"
                        aria-label="Close settings">×</button>
            </div>

            <div class="settings-section">
                <h3>YouTube API</h3>

                <div class="settings-status ${
                    apiKeySaved
                        ? "settings-status-ok"
                        : "settings-status-warning"
                }">
                    ${
                        apiKeySaved
                            ? "✓ API key saved on this device"
                            : "⚠ No API key saved"
                    }
                </div>

                <button class="settings-action-button"
                        id="change-api-key-button"
                        type="button">
                    Change API key
                </button>

                ${
                    apiKeySaved
                        ? `
                            <button class="settings-danger-button"
                                    id="remove-api-key-button"
                                    type="button">
                                Remove API key
                            </button>
                          `
                        : ""
                }
            </div>

            <div class="settings-section">
                <h3>Channels</h3>

                <p class="settings-description">
                    Following ${channels.length}
                    channel${channels.length === 1 ? "" : "s"}.
                </p>

                <p class="settings-description">
                    Automatic refresh: every 60 minutes while the app is open.
                </p>
            </div>

            <div class="settings-section">
                <h3>Backup &amp; Restore</h3>
                <p class="settings-description">
                    Download a copy of your channels, saved searches and
                    video statuses (NEW, Watched, Saved and Downloaded).
                </p>
                <label class="settings-description" style="display:flex;align-items:center;gap:9px;">
                    <input type="checkbox" id="backup-include-api-key"
                           style="width:18px;height:18px;flex-shrink:0;">
                    Include API key (sensitive — leave unticked for sharing)
                </label>
                <button class="settings-action-button" id="download-backup-button"
                        type="button">↓ Download backup (.json)</button>
                <button class="settings-action-button" id="restore-backup-button"
                        type="button">↑ Restore from backup</button>
                <input type="file" id="restore-backup-file" accept=".json,application/json"
                       style="display:none;" aria-label="Select backup JSON file">
                <p class="settings-description">
                    Restoring replaces saved app data on this device after confirmation.
                    Save a current backup before restoring.
                </p>
            </div>

            <div class="settings-footer">
                <button class="form-button form-cancel-button"
                        id="close-settings-footer-button"
                        type="button">
                    Close
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    document
        .getElementById("close-settings-button")
        ?.addEventListener("click", closeSettings);

    document
        .getElementById("close-settings-footer-button")
        ?.addEventListener("click", closeSettings);

    document
        .getElementById("change-api-key-button")
        ?.addEventListener("click", showChangeApiKeyForm);

    document
        .getElementById("remove-api-key-button")
        ?.addEventListener("click", removeStoredApiKey);

    document.getElementById("download-backup-button")
        ?.addEventListener("click", downloadMyYouTubeBackup);
    document.getElementById("restore-backup-button")
        ?.addEventListener("click", () =>
            document.getElementById("restore-backup-file")?.click());
    document.getElementById("restore-backup-file")
        ?.addEventListener("change", handleMyYouTubeRestore);

    modal.addEventListener("click", event => {
        if (event.target === modal) closeSettings();
    });
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
            resultLimit: item.resultLimit
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
        resultLimit: prefs.resultLimit
    };

    const allowedPages = ["new", "saved", "watched", "channels", "search"];
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
    savedSearches = data.savedSearches;
    editingSavedSearchId = null;
    searchPreferencesBeforeEdit = null;
    searchPreferences = data.searchPreferences;
    currentPage = data.currentPage;
    searchResults = [];
    searchWasRun = false;
    searchResultMessage = "Enter a topic and tap Search YouTube.";
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
        return videos.filter(video => video.isNew && !video.watched);
    }

    if (currentPage === "saved") {
        return videos.filter(video => video.saved);
    }

    if (currentPage === "watched") {
        return videos.filter(video => video.watched);
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
   CONTENT
   ========================================= */

function updateContent() {
    const videoList = document.querySelector(".video-list");
    const sectionTitle = document.querySelector(".section-header h2");

    if (!videoList || !sectionTitle) return;

    if (currentPage === "channels") {
        renderChannelsPage();
        return;
    }

    if (currentPage === "search") {
        renderSearchPage();
        updateNewVideoCount();
        return;
    }

    if (currentPage === "new") {
        sectionTitle.textContent = "New Videos";
    } else if (currentPage === "saved") {
        sectionTitle.textContent = "Saved Videos";
    } else if (currentPage === "watched") {
        sectionTitle.textContent = "Watched Videos";
    }

    addRefreshButton();

    const visibleVideos = getVisibleVideos();

    // Videos already on a channel when it is first followed are not NEW.
    // Keep them accessible in a separate section instead of hiding them.
    const recentVideos = currentPage === "new"
        ? videos.filter(video =>
            !video.isNew &&
            !video.watched &&
            channels.some(channel => channel.id === video.channelId)
        ).slice(0, 30)
        : [];

    if (visibleVideos.length === 0 && recentVideos.length === 0) {
        const message =
            currentPage === "new"
                ? "New videos will appear here when your followed channels upload them."
                : "Videos will appear here when available.";

        videoList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">○</div>
                <h3>Nothing here yet</h3>
                <p>${escapeHtml(message)}</p>
            </div>
        `;

        updateNewVideoCount();
        return;
    }

    if (currentPage === "new") {
        const newCards = visibleVideos
            .map(video => createVideoCard(video))
            .join("");

        const recentSection = recentVideos.length > 0
            ? `
                <div style="margin:24px 0 12px;">
                    <h3 style="margin:0 0 6px;">Recent videos</h3>
                    <p style="margin:0;opacity:0.7;font-size:13px;">
                        From your followed channels · Not marked NEW
                    </p>
                </div>
                ${recentVideos.map(video => createVideoCard(video)).join("")}
              `
            : "";

        const noNewMessage = visibleVideos.length === 0
            ? `<p style="opacity:0.7;">No new uploads right now.</p>`
            : "";

        videoList.innerHTML = newCards + noNewMessage + recentSection;
    } else {
        videoList.innerHTML = visibleVideos
            .map(video => createVideoCard(video))
            .join("");
    }

    setupVideoButtons();
    updateNewVideoCount();
}

function updateNewVideoCount() {
    const count = videos.filter(
        video => video.isNew && !video.watched
    ).length;

    // Update the counter already present in index.html.
    const headerCount = document.querySelector(".video-count");

    if (headerCount) {
        headerCount.textContent = `${count} new`;
        headerCount.style.display = currentPage === "new" ? "" : "none";
    }

    // Show the same live count next to New in bottom navigation.
    // This reuses the existing markup; index.html and style.css stay unchanged.
    const newButton = document.querySelectorAll(".nav-button")[0];
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

function createVideoCard(video) {
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

        card.querySelector(".watched-button")
            ?.addEventListener("click", () => toggleWatched(videoId));

        card.querySelector(".save-button")
            ?.addEventListener("click", () => toggleSaved(videoId));

        card.querySelector(".download-button")
            ?.addEventListener("click", () => toggleDownloaded(videoId));
    });
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
    const resultCards = searchResults.map(item => {
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
                        ${item.minMinutes}+ min · ${item.resultLimit} videos · Newest first
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
            <p style="margin:0;font-size:12px;color:#94a3b8;">
                Newest first · At least the selected duration.
                Searches use YouTube API quota and run only when requested.
            </p>
            <button class="form-button form-save-button" type="submit"
                    style="width:100%;" ${searchInProgress ? "disabled" : ""}>
                ${searchInProgress ? "Searching..." : "⌕ Search YouTube"}
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
        <section aria-label="Saved searches" style="margin:0 0 16px;">
            <h3 style="font-size:16px;margin:0 0 10px;">
                Saved searches (${savedSearches.length})
            </h3>
            <p style="margin:0 0 8px;font-size:12px;color:#94a3b8;">
                Tap Edit to change the saved words, minimum minutes or result count.
            </p>
            <div style="display:grid;gap:8px;">${savedSearchCards}</div>
        </section>
        <p role="status" aria-live="polite"
           style="margin:4px 0 14px;font-size:13px;color:#94a3b8;">
            ${escapeHtml(searchResultMessage)}
        </p>
        ${resultCards}
    `;

    document.getElementById("youtube-search-form")
        ?.addEventListener("submit", handleSearchSubmit);
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

async function runYouTubeSearch(preferences) {
    if (searchInProgress) return;
    if (!getApiKey()) {
        alert("Save your YouTube API key in Settings first.");
        return;
    }

    editingSavedSearchId = null;
    searchPreferencesBeforeEdit = null;
    searchPreferences = { ...preferences };
    saveSearchPreferences();
    searchInProgress = true;
    searchResultMessage = "Searching YouTube...";
    if (currentPage === "search") updateContent();

    try {
        searchResults = await searchYouTubeVideos(
            searchPreferences.query,
            searchPreferences.minMinutes,
            searchPreferences.resultLimit
        );
        searchWasRun = true;
        const count = searchResults.length;
        searchResultMessage = count
            ? `${count} video${count === 1 ? "" : "s"} found · Newest first · ${preferences.minMinutes}+ minutes.` +
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

async function searchYouTubeVideos(query, minimumMinutes, resultLimit) {
    const matches = [];
    const seen = new Set();
    let pageToken = "";
    const minimumSeconds = minimumMinutes * 60;

    // Up to 3 pages (150 candidates) to avoid unbounded quota use.
    // Some queries won't provide the full requested 10 or 20 matches.
    for (let page = 0; page < 3 && matches.length < resultLimit; page++) {
        const searchParams = {
            part: "snippet",
            q: query,
            type: "video",
            order: "date",
            maxResults: "50",
            videoDuration: minimumMinutes > 20 ? "long" : "any"
        };
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
   CHANNELS PAGE
   ========================================= */

function renderChannelsPage() {
    const videoList = document.querySelector(".video-list");
    const sectionTitle = document.querySelector(".section-header h2");

    if (!videoList || !sectionTitle) return;

    sectionTitle.textContent = "Channels";

    document
        .getElementById("refresh-page-button")
        ?.remove();

    if (channels.length === 0) {
        videoList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">▣</div>

                <h3>No channels yet</h3>

                <p>
                    Add a YouTube channel to start following it.
                </p>

                <button class="add-channel-button"
                        type="button">
                    + Add channel
                </button>
            </div>
        `;

        setupAddChannelButton();
        updateNewVideoCount();
        return;
    }

    videoList.innerHTML = `
        <button class="add-channel-button"
                type="button">
            + Add channel
        </button>

        <button class="add-channel-button"
                id="refresh-all-channels-button"
                type="button">
            ↻ Refresh All Channels
        </button>

        <div class="channel-last-refresh">
            ${
                getLastRefreshText()
                    ? escapeHtml(getLastRefreshText())
                    : "Not refreshed yet"
            }
        </div>

        <div class="channel-list">
            ${channels
                .map(channel => createChannelCard(channel))
                .join("")}
        </div>
    `;

    setupAddChannelButton();
    setupChannelButtons();
    setupRefreshAllChannelsButton();
    updateNewVideoCount();
}

function createChannelCard(channel) {
    const thumbnail = channel.thumbnail
        ? `
            <img class="channel-thumbnail"
                 src="${escapeHtml(channel.thumbnail)}"
                 alt="">
          `
        : "";

    const status = channel.verified
        ? "✓ Connected to YouTube"
        : "Not connected";

    return `
        <article class="channel-card"
                 data-channel-id="${escapeHtml(channel.id)}">

            <div class="channel-card-header">
                ${thumbnail}

                <div>
                    <h3 class="channel-card-name">
                        ${escapeHtml(channel.name)}
                    </h3>

                    <p class="channel-card-url">
                        ${escapeHtml(status)}
                    </p>

                    ${
                        channel.lastUpdated
                            ? `
                                <p class="channel-card-url">
                                    Checked:
                                    ${escapeHtml(
                                        channel.lastUpdated
                                    )}
                                </p>
                              `
                            : ""
                    }
                </div>
            </div>

            <div class="channel-card-actions">
                <button class="channel-delete-button"
                        type="button">
                    Delete channel
                </button>
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
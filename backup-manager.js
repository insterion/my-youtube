/* ==============================================
   MY YOUTUBE — BACKUP MANAGER
   Maintenance 1.3.5 (2026-11-02)

   Existing Backup & Restore functions moved verbatim
   from app.js, without changing the JSON format,
   stored keys, permissions, or restore behavior.

   This regular browser script runs before app.js.
   Its functions are called after app.js initializes
   its global state. No new services are needed.
   ============================================== */

/* =========================================
   BACKUP & RESTORE
   - Local JSON file; no server or YouTube API calls.
   - API key is excluded by default.
   - Restore replaces this device's saved app data after confirmation.
   ========================================= */

function createMyYouTubeBackup(includeApiKey = false) {
    // Never export an apparently empty library over damaged stored data.
    ensureLibraryWritable();
    const data = {
        videos,
        channels,
        savedSearches,
        searchPreferences,
        watchQueue: [...watchQueue],
        smartFeed: normalizeSmartFeedPrefs(smartFeedPrefs, channels.map(channel => channel.id)),
        homeLayout: normalizeHomeLayout(homeLayout),
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

    // Older backup files have no watchQueue; treat them as an empty queue.
    const rawQueue = d.watchQueue === undefined ? [] : d.watchQueue;
    if (!Array.isArray(rawQueue) || rawQueue.length > WATCH_QUEUE_LIMIT) {
        throw new Error("Invalid Watch Queue in backup.");
    }
    const restoredVideoIds = new Set(restoredVideos.map(video => video.id));
    if (rawQueue.some(id => typeof id !== "string" ||
        !/^[A-Za-z0-9_-]{11}$/.test(id) || !restoredVideoIds.has(id)) ||
        new Set(rawQueue).size !== rawQueue.length) {
        throw new Error("Watch Queue contains invalid or missing videos.");
    }
    const restoredQueue = rawQueue.filter(id =>
        !restoredVideos.find(video => video.id === id)?.hidden);

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

    const allowedPages = ["home", "new", "saved", "watched", "channels", "search", "queue", "feed"];
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
        watchQueue: restoredQueue,
        smartFeed: normalizeSmartFeedPrefs(d.smartFeed, restoredChannels.map(channel => channel.id)),
        searchPreferences: restoredPreferences,
        // Older backup files have no Home preference, so use the default layout.
        homeLayout: normalizeHomeLayout(d.homeLayout),
        currentPage: page,
        lastRefresh,
        hasApiKey,
        apiKey
    };
}

function applyMyYouTubeBackup(data) {
    const writes = [
        [VIDEO_STORAGE_KEY, JSON.stringify(data.videos)],
        [WATCH_QUEUE_KEY, JSON.stringify(data.watchQueue)],
        [SMART_FEED_KEY, JSON.stringify(data.smartFeed)],
        [CHANNEL_STORAGE_KEY, JSON.stringify(data.channels)],
        [SAVED_SEARCHES_KEY, JSON.stringify(data.savedSearches)],
        [SEARCH_PREFS_KEY, JSON.stringify(data.searchPreferences)],
        [HOME_LAYOUT_KEY, JSON.stringify(data.homeLayout)],
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

    // A validated restore is the only operation permitted to replace damaged lists.
    const resumingAfterRecovery = Boolean(storageIntegrityIssue);
    storageIntegrityIssue = "";
    document.getElementById("storage-integrity-warning")?.remove();
    videos = data.videos;
    watchQueue = data.watchQueue;
    smartFeedPrefs = normalizeSmartFeedPrefs(data.smartFeed, data.channels.map(channel => channel.id));
    smartFeedRulesOpen = false;
    queueMessage = "";
    channels = data.channels;
    activeChannelId = null;
    activeChannelVideoFilter = "all";
    savedSearches = data.savedSearches;
    editingSavedSearchId = null;
    searchPreferencesBeforeEdit = null;
    searchPreferences = data.searchPreferences;
    homeLayout = normalizeHomeLayout(data.homeLayout);
    homeEditorOpen = false;
    currentPage = data.currentPage;
    searchResults = [];
    searchWasRun = false;
    searchResultMessage = "Enter a topic and tap Search YouTube.";
    // Old cached searches should not reappear after restoring another backup.
    clearSearchCache();
    sortVideos();
    updateNavigation();
    updateContent();
    if (resumingAfterRecovery) {
        startAutomaticRefresh();
        void maybeAutoRefresh();
    }
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
            `${data.videos.length} videos and ${data.watchQueue.length} queued videos.\n\n` +
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


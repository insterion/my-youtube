/* ==============================================
   MY YOUTUBE - LIBRARY STORAGE
   Maintenance 1.3.4 (2026-11-02)

   Existing functions moved intact from app.js.
   This is a regular browser script loaded before app.js.
   Storage keys and in-memory state remain declared in app.js.
   All functions execute only after app.js initializes those values.
   No migration, new permissions, or data-format changes.
   ============================================== */

function detectStorageIntegrityIssue() {
    const checks = [
        [VIDEO_STORAGE_KEY, entry => entry && typeof entry === "object" &&
            !Array.isArray(entry) && typeof entry.id === "string"],
        [CHANNEL_STORAGE_KEY, entry => entry && typeof entry === "object" &&
            !Array.isArray(entry) && typeof entry.id === "string"],
        [SAVED_SEARCHES_KEY, entry => entry && typeof entry === "object" &&
            !Array.isArray(entry) && typeof entry.query === "string"],
        [WATCH_QUEUE_KEY, entry => typeof entry === "string"]
    ];
    try {
        for (const [key, validEntry] of checks) {
            const raw = localStorage.getItem(key);
            if (raw === null) continue;
            const value = JSON.parse(raw);
            if (!Array.isArray(value) || !value.every(validEntry)) return key;
        }
    } catch (error) {
        return "unreadable saved library data";
    }
    return "";
}

function ensureLibraryWritable() {
    if (storageIntegrityIssue) {
        throw new Error("Saved library data needs recovery from a backup. No changes were written.");
    }
}

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
    ensureLibraryWritable();
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
    ensureLibraryWritable();
    localStorage.setItem(CHANNEL_STORAGE_KEY, JSON.stringify(channels));
}

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
    ensureLibraryWritable();
    localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(savedSearches));
}

function loadWatchQueue() {
    try {
        const value = JSON.parse(localStorage.getItem(WATCH_QUEUE_KEY) || "[]");
        if (!Array.isArray(value)) return [];
        const ids = new Set(videos.filter(video =>
            !video.hidden && /^[A-Za-z0-9_-]{11}$/.test(video.id)).map(video => video.id));
        return [...new Set(value.filter(id => typeof id === "string" && ids.has(id)))].slice(0, WATCH_QUEUE_LIMIT);
    } catch (error) {
        console.log("Could not load Watch Queue", error);
        return [];
    }
}

function saveWatchQueue() {
    ensureLibraryWritable();
    localStorage.setItem(WATCH_QUEUE_KEY, JSON.stringify(watchQueue));
}

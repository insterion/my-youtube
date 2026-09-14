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

const AUTO_REFRESH_INTERVAL = 30 * 60 * 1000;

let videos = [];
let channels = [];
let currentPage = localStorage.getItem(PAGE_STORAGE_KEY) || "new";
let refreshInProgress = false;

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
   NAVIGATION
   ========================================= */

function setupNavigation() {
    const navButtons = document.querySelectorAll(".nav-button");

    navButtons.forEach((button, index) => {
        button.addEventListener("click", () => {
            const pages = ["new", "saved", "watched", "channels"];
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
        channels: 3
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
                    Automatic refresh: every 30 minutes while the app is open.
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

    if (currentPage === "new") {
        sectionTitle.textContent = "New Videos";
    } else if (currentPage === "saved") {
        sectionTitle.textContent = "Saved Videos";
    } else if (currentPage === "watched") {
        sectionTitle.textContent = "Watched Videos";
    }

    addRefreshButton();

    const visibleVideos = getVisibleVideos();

    if (visibleVideos.length === 0) {
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

    videoList.innerHTML = visibleVideos
        .map(video => createVideoCard(video))
        .join("");

    setupVideoButtons();
    updateNewVideoCount();
}

function updateNewVideoCount() {
    const count = videos.filter(
        video => video.isNew && !video.watched
    ).length;

    const possibleElements = [
        document.getElementById("new-video-count"),
        document.querySelector(".new-video-count"),
        document.querySelector(".nav-button[data-page='new'] .count")
    ].filter(Boolean);

    possibleElements.forEach(element => {
        element.textContent = count > 0 ? String(count) : "";
        element.style.display = count > 0 ? "" : "none";
    });
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

function watchVideo(videoId) {
    const video = videos.find(item => item.id === videoId);
    if (!video) return;

    if (video.youtubeUrl) {
        window.open(video.youtubeUrl, "_blank");
    } else {
        alert("No YouTube link is available.");
    }
}

function toggleWatched(videoId) {
    const video = videos.find(item => item.id === videoId);
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
    const video = videos.find(item => item.id === videoId);
    if (!video) return;

    video.saved = !video.saved;
    saveVideos();
    updateContent();
}

function toggleDownloaded(videoId) {
    const video = videos.find(item => item.id === videoId);
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
            const publishedAt = snippet?.publishedAt || "";

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
            const publishedAt = snippet?.publishedAt || "";

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

function mergeVideo(newVideo) {
    const existingIndex = videos.findIndex(
        video => video.id === newVideo.id
    );

    if (existingIndex === -1) {
        videos.push({
            ...newVideo,
            isNew: true,
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
        saveLastRefreshTime();
        updateContent();

        if (!silent) {
            alert(
                `Refresh complete.\n\n` +
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

        let newVideosFound = 0;

        latestVideos.forEach(video => {
            const existed = videos.some(
                existing => existing.id === video.id
            );

            mergeVideo(video);

            if (!existed) newVideosFound++;
        });

        sortVideos();
        saveVideos();
        saveLastRefreshTime();

        currentPage = "new";
        saveCurrentPage();

        updateNavigation();
        updateContent();

        alert(
            `Connected to "${channelName}".\n\n` +
            `${latestVideos.length} recent videos loaded.\n` +
            `${newVideosFound} new videos added.`
        );
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

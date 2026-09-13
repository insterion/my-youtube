/* =========================================
   MY YOUTUBE
   Main application logic
   Version 0.8

   New in this version:
   - Multiple YouTube channels
   - Videos from all channels
   - Refresh All Channels
   - Correct publishing dates
   - Preserves Watched / Saved / Downloaded
   ========================================= */


/* =========================================
   STORAGE KEYS
   ========================================= */

const VIDEO_STORAGE_KEY =
    "my-youtube-videos";

const CHANNEL_STORAGE_KEY =
    "my-youtube-channels";

const PAGE_STORAGE_KEY =
    "my-youtube-page";

const API_KEY_STORAGE_KEY =
    "my-youtube-api-key";


/* =========================================
   DATA
   ========================================= */

let videos = [];

let channels = [];

let currentPage =
    localStorage.getItem(
        PAGE_STORAGE_KEY
    ) || "new";


/* =========================================
   API KEY
   ========================================= */

function getApiKey() {

    return localStorage.getItem(
        API_KEY_STORAGE_KEY
    ) || "";
}


function saveApiKey(apiKey) {

    localStorage.setItem(
        API_KEY_STORAGE_KEY,
        apiKey
    );
}


function removeApiKey() {

    localStorage.removeItem(
        API_KEY_STORAGE_KEY
    );
}


/* =========================================
   VIDEO STORAGE
   ========================================= */

function loadVideos() {

    const saved =
        localStorage.getItem(
            VIDEO_STORAGE_KEY
        );


    if (!saved) {

        return [];
    }


    try {

        const parsed =
            JSON.parse(saved);


        if (!Array.isArray(parsed)) {

            return [];
        }


        return parsed;

    } catch (error) {

        console.log(
            "Could not load videos.",
            error
        );

        return [];
    }
}


function saveVideos() {

    localStorage.setItem(
        VIDEO_STORAGE_KEY,
        JSON.stringify(videos)
    );
}


/* =========================================
   CHANNEL STORAGE
   ========================================= */

function loadChannels() {

    const saved =
        localStorage.getItem(
            CHANNEL_STORAGE_KEY
        );


    if (!saved) {

        return [];
    }


    try {

        const parsed =
            JSON.parse(saved);


        if (!Array.isArray(parsed)) {

            return [];
        }


        return parsed;

    } catch (error) {

        console.log(
            "Could not load channels.",
            error
        );

        return [];
    }
}


function saveChannels() {

    localStorage.setItem(
        CHANNEL_STORAGE_KEY,
        JSON.stringify(channels)
    );
}


/* =========================================
   PAGE STORAGE
   ========================================= */

function saveCurrentPage() {

    localStorage.setItem(
        PAGE_STORAGE_KEY,
        currentPage
    );
}


/* =========================================
   NAVIGATION
   ========================================= */

function setupNavigation() {

    const navButtons =
        document.querySelectorAll(
            ".nav-button"
        );


    navButtons.forEach(
        (button, index) => {

            button.addEventListener(
                "click",
                () => {

                    const pages = [

                        "new",

                        "saved",

                        "watched",

                        "channels"

                    ];


                    currentPage =
                        pages[index];


                    saveCurrentPage();

                    updateNavigation();

                    updateContent();

                }
            );

        }
    );
}


function updateNavigation() {

    const navButtons =
        document.querySelectorAll(
            ".nav-button"
        );


    navButtons.forEach(
        button => {

            button.classList.remove(
                "active"
            );

        }
    );


    const pageIndexes = {

        new: 0,

        saved: 1,

        watched: 2,

        channels: 3

    };


    const activeIndex =
        pageIndexes[currentPage];


    if (
        navButtons[activeIndex]
    ) {

        navButtons[activeIndex]
            .classList.add(
                "active"
            );
    }
}


/* =========================================
   VIDEO FILTERING
   ========================================= */

function getVisibleVideos() {

    if (
        currentPage ===
        "new"
    ) {

        return videos.filter(
            video =>
                !video.watched
        );
    }


    if (
        currentPage ===
        "saved"
    ) {

        return videos.filter(
            video =>
                video.saved
        );
    }


    if (
        currentPage ===
        "watched"
    ) {

        return videos.filter(
            video =>
                video.watched
        );
    }


    return [];
}


/* =========================================
   SORT VIDEOS
   ========================================= */

function sortVideos() {

    videos.sort(
        (
            first,
            second
        ) => {

            const firstTime =
                new Date(
                    first.publishedAt ||
                    first.date ||
                    0
                ).getTime();


            const secondTime =
                new Date(
                    second.publishedAt ||
                    second.date ||
                    0
                ).getTime();


            return (
                secondTime -
                firstTime
            );
        }
    );
}


/* =========================================
   UPDATE CONTENT
   ========================================= */

function updateContent() {

    const videoList =
        document.querySelector(
            ".video-list"
        );


    const sectionTitle =
        document.querySelector(
            ".section-header h2"
        );


    if (
        !videoList ||
        !sectionTitle
    ) {

        return;
    }


    if (
        currentPage ===
        "channels"
    ) {

        renderChannelsPage();

        return;
    }


    if (
        currentPage ===
        "new"
    ) {

        sectionTitle.textContent =
            "New Videos";

    } else if (
        currentPage ===
        "saved"
    ) {

        sectionTitle.textContent =
            "Saved Videos";

    } else if (
        currentPage ===
        "watched"
    ) {

        sectionTitle.textContent =
            "Watched Videos";
    }


    const visibleVideos =
        getVisibleVideos();


    if (
        visibleVideos.length === 0
    ) {

        videoList.innerHTML = `

            <div class="empty-state">

                <div class="empty-icon">
                    ○
                </div>

                <h3>
                    Nothing here yet
                </h3>

                <p>
                    Videos will appear here
                    when available.
                </p>

            </div>

        `;


        updateNewVideoCount();

        return;
    }


    videoList.innerHTML =
        visibleVideos
            .map(
                video =>
                    createVideoCard(
                        video
                    )
            )
            .join("");


    setupVideoButtons();

    updateNewVideoCount();
}


/* =========================================
   CREATE VIDEO CARD
   ========================================= */

function createVideoCard(video) {

    const watchedText =
        video.watched
            ? "✓ Watched"
            : "○ Watched";


    const savedText =
        video.saved
            ? "★ Saved"
            : "☆ Save";


    const downloadedText =
        video.downloaded
            ? "✓ Downloaded"
            : "↓ Download";


    const thumbnailHtml =
        video.thumbnail
            ? `

                <img
                    class="thumbnail-image"
                    src="${escapeHtml(
                        video.thumbnail
                    )}"
                    alt=""
                    loading="lazy"
                >

            `
            : `

                <div
                    class="thumbnail-placeholder"
                >
                    VIDEO
                </div>

            `;


    return `

        <article
            class="video-card"
            data-video-id="${escapeHtml(
                video.id
            )}"
        >

            <div class="thumbnail">

                ${thumbnailHtml}

            </div>


            <div class="video-info">

                <h3>
                    ${escapeHtml(
                        video.title
                    )}
                </h3>


                <p class="channel-name">
                    ${escapeHtml(
                        video.channel
                    )}
                </p>


                <p class="video-date">

                    ${escapeHtml(
                        video.date
                    )}

                    ${
                        video.duration
                            ? `• ${escapeHtml(
                                video.duration
                            )}`
                            : ""
                    }

                </p>


                <div class="video-actions">

                    <button
                        class="action-button watch-button"
                        type="button"
                    >
                        ▶ Watch
                    </button>


                    <button
                        class="action-button watched-button ${
                            video.watched
                                ? "is-active"
                                : ""
                        }"
                        type="button"
                    >
                        ${watchedText}
                    </button>

                </div>


                <div
                    class="video-actions secondary-actions"
                >

                    <button
                        class="action-button download-button ${
                            video.downloaded
                                ? "is-active"
                                : ""
                        }"
                        type="button"
                    >
                        ${downloadedText}
                    </button>


                    <button
                        class="action-button save-button ${
                            video.saved
                                ? "is-active"
                                : ""
                        }"
                        type="button"
                    >
                        ${savedText}
                    </button>

                </div>

            </div>

        </article>

    `;
}


/* =========================================
   SAFE HTML
   ========================================= */

function escapeHtml(text) {

    return String(text)

        .replaceAll(
            "&",
            "&amp;"
        )

        .replaceAll(
            "<",
            "&lt;"
        )

        .replaceAll(
            ">",
            "&gt;"
        )

        .replaceAll(
            '"',
            "&quot;"
        )

        .replaceAll(
            "'",
            "&#039;"
        );
}


/* =========================================
   VIDEO BUTTONS
   ========================================= */

function setupVideoButtons() {

    document
        .querySelectorAll(
            ".video-card"
        )
        .forEach(
            card => {

                const videoId =
                    card.getAttribute(
                        "data-video-id"
                    );


                const watchButton =
                    card.querySelector(
                        ".watch-button"
                    );


                const watchedButton =
                    card.querySelector(
                        ".watched-button"
                    );


                const saveButton =
                    card.querySelector(
                        ".save-button"
                    );


                const downloadButton =
                    card.querySelector(
                        ".download-button"
                    );


                if (
                    watchButton
                ) {

                    watchButton.addEventListener(
                        "click",
                        () =>
                            watchVideo(
                                videoId
                            )
                    );
                }


                if (
                    watchedButton
                ) {

                    watchedButton.addEventListener(
                        "click",
                        () =>
                            toggleWatched(
                                videoId
                            )
                    );
                }


                if (
                    saveButton
                ) {

                    saveButton.addEventListener(
                        "click",
                        () =>
                            toggleSaved(
                                videoId
                            )
                    );
                }


                if (
                    downloadButton
                ) {

                    downloadButton.addEventListener(
                        "click",
                        () =>
                            toggleDownloaded(
                                videoId
                            )
                    );
                }

            }
        );
}


/* =========================================
   WATCH VIDEO
   ========================================= */

function watchVideo(videoId) {

    const video =
        videos.find(
            item =>
                item.id ===
                videoId
        );


    if (!video) {
        return;
    }


    if (
        video.youtubeUrl
    ) {

        window.open(
            video.youtubeUrl,
            "_blank"
        );

        return;
    }


    alert(
        "No YouTube link is available."
    );
}


/* =========================================
   WATCHED
   ========================================= */

function toggleWatched(
    videoId
) {

    const video =
        videos.find(
            item =>
                item.id ===
                videoId
        );


    if (!video) {
        return;
    }


    video.watched =
        !video.watched;


    saveVideos();

    updateContent();
}


/* =========================================
   SAVED
   ========================================= */

function toggleSaved(
    videoId
) {

    const video =
        videos.find(
            item =>
                item.id ===
                videoId
        );


    if (!video) {
        return;
    }


    video.saved =
        !video.saved;


    saveVideos();

    updateContent();
}


/* =========================================
   DOWNLOADED STATUS
   ========================================= */

function toggleDownloaded(
    videoId
) {

    const video =
        videos.find(
            item =>
                item.id ===
                videoId
        );


    if (!video) {
        return;
    }


    /*
       This is currently only a status.

       Actual downloading will be
       implemented separately.
    */

    video.downloaded =
        !video.downloaded;


    saveVideos();

    updateContent();
}


/* =========================================
   NEW VIDEO COUNT
   ========================================= */

function updateNewVideoCount() {

    const countElement =
        document.querySelector(
            ".video-count"
        );


    if (!countElement) {
        return;
    }


    if (
        currentPage ===
        "channels"
    ) {

        countElement.textContent =
            `${channels.length} channels`;

        return;
    }


    const newCount =
        videos.filter(
            video =>
                !video.watched
        ).length;


    if (
        newCount === 1
    ) {

        countElement.textContent =
            "1 new";

    } else {

        countElement.textContent =
            `${newCount} new`;
    }
}


/* =========================================
   CHANNELS PAGE
   ========================================= */

function renderChannelsPage() {

    const videoList =
        document.querySelector(
            ".video-list"
        );


    const sectionTitle =
        document.querySelector(
            ".section-header h2"
        );


    if (
        !videoList ||
        !sectionTitle
    ) {

        return;
    }


    sectionTitle.textContent =
        "Channels";


    if (
        channels.length === 0
    ) {

        videoList.innerHTML = `

            <div class="empty-state">

                <div class="empty-icon">
                    ▣
                </div>

                <h3>
                    No channels yet
                </h3>

                <p>
                    Add a YouTube channel
                    to start following it.
                </p>

                <button
                    class="add-channel-button"
                    type="button"
                >
                    + Add channel
                </button>

            </div>

        `;


        setupAddChannelButton();

        updateNewVideoCount();

        return;
    }


    videoList.innerHTML = `

        <button
            class="add-channel-button"
            type="button"
        >
            + Add channel
        </button>


        <button
            class="add-channel-button"
            id="refresh-all-channels-button"
            type="button"
        >
            ↻ Refresh All Channels
        </button>


        <div class="channel-list">

            ${channels
                .map(
                    channel =>
                        createChannelCard(
                            channel
                        )
                )
                .join("")
            }

        </div>

    `;


    setupAddChannelButton();

    setupChannelButtons();

    setupRefreshAllChannelsButton();

    updateNewVideoCount();
}


/* =========================================
   CHANNEL CARD
   ========================================= */

function createChannelCard(
    channel
) {

    const statusText =
        channel.verified
            ? "✓ Connected to YouTube"
            : "Local channel";


    const thumbnailHtml =
        channel.thumbnail
            ? `

                <img
                    class="channel-thumbnail"
                    src="${escapeHtml(
                        channel.thumbnail
                    )}"
                    alt=""
                >

            `
            : "";


    return `

        <article
            class="channel-card"
            data-channel-id="${escapeHtml(
                channel.id
            )}"
        >

            <div
                class="channel-card-header"
            >

                ${thumbnailHtml}


                <div>

                    <h3
                        class="channel-card-name"
                    >

                        ${escapeHtml(
                            channel.name
                        )}

                    </h3>


                    <p
                        class="channel-card-url"
                    >

                        ${escapeHtml(
                            statusText
                        )}

                    </p>


                    ${
                        channel.lastUpdated
                            ? `

                                <p
                                    class="channel-card-url"
                                >

                                    Last checked:
                                    ${escapeHtml(
                                        channel.lastUpdated
                                    )}

                                </p>

                              `
                            : ""
                    }

                </div>

            </div>


            <div
                class="channel-card-actions"
            >

                <button
                    class="channel-delete-button"
                    type="button"
                >
                    Delete channel
                </button>

            </div>

        </article>

    `;
}


/* =========================================
   ADD CHANNEL
   ========================================= */

function setupAddChannelButton() {

    const buttons =
        document.querySelectorAll(
            ".add-channel-button"
        );


    buttons.forEach(
        button => {

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

        }
    );
}


/* =========================================
   REFRESH BUTTON
   ========================================= */

function setupRefreshAllChannelsButton() {

    const button =
        document.getElementById(
            "refresh-all-channels-button"
        );


    if (!button) {
        return;
    }


    button.addEventListener(
        "click",
        refreshAllChannels
    );
}


/* =========================================
   ADD CHANNEL FORM
   ========================================= */

function showAddChannelForm() {

    const videoList =
        document.querySelector(
            ".video-list"
        );


    if (!videoList) {
        return;
    }


    if (
        document.querySelector(
            ".channel-form"
        )
    ) {

        return;
    }


    const existingApiKey =
        getApiKey();


    const apiKeyHtml =
        existingApiKey
            ? `

                <p class="api-key-saved">
                    ✓ API key already saved
                </p>

            `
            : `

                <label>

                    YouTube API key

                    <input
                        type="password"
                        id="youtube-api-key-input"
                        placeholder="Paste your API key here"
                        autocomplete="off"
                    >

                </label>

            `;


    const form =
        document.createElement(
            "div"
        );


    form.className =
        "channel-form";


    form.innerHTML = `

        <h3>
            Add YouTube Channel
        </h3>


        <label>

            YouTube channel URL

            <input
                type="url"
                id="channel-url-input"
                placeholder="https://youtube.com/@channel"
                autocomplete="off"
            >

        </label>


        ${apiKeyHtml}


        <div
            class="form-actions"
        >

            <button
                class="form-button form-save-button"
                id="save-channel-button"
                type="button"
            >
                Find channel
            </button>


            <button
                class="form-button form-cancel-button"
                id="cancel-channel-button"
                type="button"
            >
                Cancel
            </button>

        </div>

    `;


    videoList.prepend(
        form
    );


    const saveButton =
        document.getElementById(
            "save-channel-button"
        );


    const cancelButton =
        document.getElementById(
            "cancel-channel-button"
        );


    if (saveButton) {

        saveButton.addEventListener(
            "click",
            connectYouTubeChannel
        );
    }


    if (cancelButton) {

        cancelButton.addEventListener(
            "click",
            () =>
                updateContent()
        );
    }
}


/* =========================================
   PARSE CHANNEL URL
   ========================================= */

function parseYouTubeChannelUrl(
    url
) {

    let parsedUrl;


    try {

        parsedUrl =
            new URL(url);

    } catch (error) {

        return {
            valid: false,
            type: null,
            value: null
        };
    }


    const hostname =
        parsedUrl.hostname
            .toLowerCase()
            .replace(
                /^www\./,
                ""
            );


    if (
        hostname !==
            "youtube.com" &&
        hostname !==
            "m.youtube.com"
    ) {

        return {
            valid: false,
            type: null,
            value: null
        };
    }


    const path =
        parsedUrl.pathname
            .replace(
                /\/+$/,
                ""
            );


    if (
        path.startsWith(
            "/@"
        )
    ) {

        return {

            valid: true,

            type:
                "handle",

            value:
                path.substring(1)

        };
    }


    if (
        path.startsWith(
            "/channel/"
        )
    ) {

        return {

            valid: true,

            type:
                "id",

            value:
                path.substring(
                    "/channel/".length
                )

        };
    }


    if (
        path.startsWith(
            "/user/"
        )
    ) {

        return {

            valid: true,

            type:
                "username",

            value:
                path.substring(
                    "/user/".length
                )

        };
    }


    return {

        valid:
            false,

        type:
            null,

        value:
            null

    };
}


/* =========================================
   YOUTUBE API REQUEST
   ========================================= */

async function youtubeApiRequest(
    endpoint,
    parameters
) {

    const apiKey =
        getApiKey();


    if (!apiKey) {

        throw new Error(
            "NO_API_KEY"
        );
    }


    const url =
        new URL(
            `https://www.googleapis.com/youtube/v3/${endpoint}`
        );


    Object.entries(
        parameters
    ).forEach(
        ([key, value]) => {

            url.searchParams.set(
                key,
                value
            );

        }
    );


    url.searchParams.set(
        "key",
        apiKey
    );


    const response =
        await fetch(
            url.toString()
        );


    let data;


    try {

        data =
            await response.json();

    } catch (error) {

        throw new Error(
            "INVALID_API_RESPONSE"
        );
    }


    if (!response.ok) {

        const reason =
            data?.error?.errors?.[0]?.reason ||
            data?.error?.message ||
            "UNKNOWN_API_ERROR";


        throw new Error(
            reason
        );
    }


    return data;
}


/* =========================================
   FIND CHANNEL
   ========================================= */

async function findYouTubeChannel(
    parsedUrl
) {

    let parameters = {

        part:
            "snippet,contentDetails"

    };


    if (
        parsedUrl.type ===
        "handle"
    ) {

        parameters.forHandle =
            parsedUrl.value;

    } else if (
        parsedUrl.type ===
        "id"
    ) {

        parameters.id =
            parsedUrl.value;

    } else if (
        parsedUrl.type ===
        "username"
    ) {

        parameters.forUsername =
            parsedUrl.value;

    } else {

        throw new Error(
            "UNSUPPORTED_CHANNEL_URL"
        );
    }


    const response =
        await youtubeApiRequest(
            "channels",
            parameters
        );


    if (
        !response.items ||
        response.items.length === 0
    ) {

        throw new Error(
            "CHANNEL_NOT_FOUND"
        );
    }


    return response.items[0];
}


/* =========================================
   LOAD CHANNEL VIDEOS
   ========================================= */

async function loadChannelVideos(
    channel
) {

    const uploadsPlaylistId =
        channel
            ?.contentDetails
            ?.relatedPlaylists
            ?.uploads;


    if (!uploadsPlaylistId) {

        throw new Error(
            "UPLOADS_PLAYLIST_NOT_FOUND"
        );
    }


    const playlistResponse =
        await youtubeApiRequest(
            "playlistItems",
            {

                part:
                    "snippet,contentDetails",

                playlistId:
                    uploadsPlaylistId,

                maxResults:
                    "10"

            }
        );


    if (
        !playlistResponse.items
    ) {

        return [];
    }


    const videoIds =
        playlistResponse.items

            .map(
                item =>
                    item
                        ?.contentDetails
                        ?.videoId
            )

            .filter(Boolean);


    if (
        videoIds.length === 0
    ) {

        return [];
    }


    const videoResponse =
        await youtubeApiRequest(
            "videos",
            {

                part:
                    "snippet,contentDetails",

                id:
                    videoIds.join(",")

            }
        );


    const videoMap =
        new Map();


    if (
        videoResponse.items
    ) {

        videoResponse.items.forEach(
            item => {

                videoMap.set(
                    item.id,
                    item
                );

            }
        );
    }


    return playlistResponse.items

        .map(
            item => {

                const videoId =
                    item
                        ?.contentDetails
                        ?.videoId;


                if (!videoId) {
                    return null;
                }


                const details =
                    videoMap.get(
                        videoId
                    );


                const snippet =
                    item.snippet;


                const publishedAt =
                    snippet
                        ?.publishedAt ||
                    "";


                return {

                    id:
                        videoId,

                    title:
                        snippet?.title ||
                        "Untitled video",

                    channel:
                        snippet?.channelTitle ||
                        channel
                            ?.snippet
                            ?.title ||
                        "Unknown channel",

                    date:
                        formatYouTubeDate(
                            publishedAt
                        ),

                    publishedAt:
                        publishedAt,

                    duration:
                        details
                            ? formatDuration(
                                details
                                    ?.contentDetails
                                    ?.duration
                            )
                            : "",

                    watched:
                        false,

                    saved:
                        false,

                    downloaded:
                        false,

                    youtubeUrl:
                        `https://www.youtube.com/watch?v=${videoId}`,

                    thumbnail:
                        snippet
                            ?.thumbnails
                            ?.maxres
                            ?.url ||

                        snippet
                            ?.thumbnails
                            ?.high
                            ?.url ||

                        snippet
                            ?.thumbnails
                            ?.medium
                            ?.url ||

                        snippet
                            ?.thumbnails
                            ?.default
                            ?.url ||

                        "",

                    channelId:
                        channel.id
                };

            }
        )

        .filter(Boolean);
}


/* =========================================
   DATE FORMAT
   ========================================= */

function formatYouTubeDate(
    dateString
) {

    if (!dateString) {
        return "";
    }


    const date =
        new Date(
            dateString
        );


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return "";
    }


    return date.toLocaleDateString(
        "en-GB",
        {

            day:
                "2-digit",

            month:
                "short",

            year:
                "numeric"

        }
    );
}


/* =========================================
   DURATION FORMAT
   ========================================= */

function formatDuration(
    isoDuration
) {

    if (!isoDuration) {
        return "";
    }


    const match =
        isoDuration.match(
            /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/
        );


    if (!match) {
        return "";
    }


    const hours =
        Number(
            match[1] || 0
        );


    const minutes =
        Number(
            match[2] || 0
        );


    const seconds =
        Number(
            match[3] || 0
        );


    if (
        hours > 0
    ) {

        return (
            `${hours}h ` +
            `${String(
                minutes
            ).padStart(
                2,
                "0"
            )}m`
        );
    }


    if (
        minutes > 0
    ) {

        return (
            seconds > 0

                ? `${minutes}m ${String(
                    seconds
                ).padStart(
                    2,
                    "0"
                )}s`

                : `${minutes}m`
        );
    }


    return `${seconds}s`;
}


/* =========================================
   MERGE VIDEO
   ========================================= */

function mergeVideo(
    newVideo
) {

    const existingIndex =
        videos.findIndex(
            video =>
                video.id ===
                newVideo.id
        );


    if (
        existingIndex ===
        -1
    ) {

        videos.push(
            newVideo
        );

        return;
    }


    const existingVideo =
        videos[
            existingIndex
        ];


    videos[
        existingIndex
    ] = {

        ...existingVideo,

        title:
            newVideo.title,

        channel:
            newVideo.channel,

        channelId:
            newVideo.channelId,

        date:
            newVideo.date,

        publishedAt:
            newVideo.publishedAt,

        duration:
            newVideo.duration,

        youtubeUrl:
            newVideo.youtubeUrl,

        thumbnail:
            newVideo.thumbnail

    };
}


/* =========================================
   CONNECT CHANNEL
   ========================================= */

async function connectYouTubeChannel() {

    const urlInput =
        document.getElementById(
            "channel-url-input"
        );


    const apiKeyInput =
        document.getElementById(
            "youtube-api-key-input"
        );


    if (!urlInput) {
        return;
    }


    const url =
        urlInput.value.trim();


    if (!url) {

        alert(
            "Please enter a YouTube channel URL."
        );

        return;
    }


    const parsedUrl =
        parseYouTubeChannelUrl(
            url
        );


    if (!parsedUrl.valid) {

        alert(
            "Please enter a valid YouTube channel URL."
        );

        return;
    }


    if (
        !getApiKey() &&
        apiKeyInput
    ) {

        const enteredApiKey =
            apiKeyInput.value.trim();


        if (!enteredApiKey) {

            alert(
                "Please enter your YouTube API key."
            );

            return;
        }


        saveApiKey(
            enteredApiKey
        );
    }


    const button =
        document.getElementById(
            "save-channel-button"
        );


    if (button) {

        button.disabled =
            true;

        button.textContent =
            "Connecting...";
    }


    try {

        const channel =
            await findYouTubeChannel(
                parsedUrl
            );


        const latestVideos =
            await loadChannelVideos(
                channel
            );


        const channelId =
            channel.id;


        const channelName =
            channel
                ?.snippet
                ?.title ||
            "YouTube Channel";


        const uploadsPlaylistId =
            channel
                ?.contentDetails
                ?.relatedPlaylists
                ?.uploads ||
            "";


        const channelUrl =
            `https://www.youtube.com/channel/${channelId}`;


        const newChannel = {

            id:
                channelId,

            name:
                channelName,

            url:
                channelUrl,

            originalUrl:
                url,

            uploadsPlaylistId:
                uploadsPlaylistId,

            thumbnail:
                channel
                    ?.snippet
                    ?.thumbnails
                    ?.medium
                    ?.url ||

                channel
                    ?.snippet
                    ?.thumbnails
                    ?.default
                    ?.url ||

                "",

            verified:
                true,

            addedAt:
                new Date().toISOString(),

            lastUpdated:
                formatDateTime(
                    new Date()
                )
        };


        const existingChannelIndex =
            channels.findIndex(
                item =>
                    item.id ===
                    channelId
            );


        if (
            existingChannelIndex >=
            0
        ) {

            channels[
                existingChannelIndex
            ] = {

                ...channels[
                    existingChannelIndex
                ],

                ...newChannel

            };

        } else {

            channels.push(
                newChannel
            );
        }


        saveChannels();


        latestVideos.forEach(
            video =>
                mergeVideo(
                    video
                )
        );


        sortVideos();

        saveVideos();


        currentPage =
            "new";


        saveCurrentPage();

        updateNavigation();

        updateContent();


        alert(
            `Connected to "${channelName}".\n\n${latestVideos.length} recent videos loaded.`
        );


    } catch (error) {

        console.log(
            "Connect channel error:",
            error
        );


        showYouTubeError(
            error
        );


    } finally {

        if (button) {

            button.disabled =
                false;

            button.textContent =
                "Find channel";
        }
    }
}


/* =========================================
   REFRESH ALL CHANNELS
   ========================================= */

async function refreshAllChannels() {

    if (
        channels.length === 0
    ) {

        alert(
            "There are no channels to refresh."
        );

        return;
    }


    const button =
        document.getElementById(
            "refresh-all-channels-button"
        );


    if (button) {

        button.disabled =
            true;

        button.textContent =
            "Refreshing...";
    }


    let totalVideos =
        0;

    let successfulChannels =
        0;

    let failedChannels =
        0;


    try {

        for (
            const savedChannel
            of channels
        ) {

            try {

                const parsedUrl =
                    parseYouTubeChannelUrl(
                        savedChannel.originalUrl ||
                        savedChannel.url
                    );


                let channel;


                if (
                    parsedUrl.valid
                ) {

                    channel =
                        await findYouTubeChannel(
                            parsedUrl
                        );

                } else {

                    /*
                       We already know the real
                       channel ID, so use it directly.
                    */

                    channel =
                        await youtubeApiRequest(
                            "channels",
                            {

                                part:
                                    "snippet,contentDetails",

                                id:
                                    savedChannel.id

                            }
                        );


                    if (
                        !channel.items ||
                        channel.items.length === 0
                    ) {

                        throw new Error(
                            "CHANNEL_NOT_FOUND"
                        );
                    }


                    channel =
                        channel.items[0];
                }


                const latestVideos =
                    await loadChannelVideos(
                        channel
                    );


                latestVideos.forEach(
                    video =>
                        mergeVideo(
                            video
                        )
                );


                totalVideos +=
                    latestVideos.length;


                successfulChannels++;


                const channelIndex =
                    channels.findIndex(
                        item =>
                            item.id ===
                            savedChannel.id
                    );


                if (
                    channelIndex >= 0
                ) {

                    channels[
                        channelIndex
                    ].name =
                        channel
                            ?.snippet
                            ?.title ||
                        channels[
                            channelIndex
                        ].name;


                    channels[
                        channelIndex
                    ].thumbnail =
                        channel
                            ?.snippet
                            ?.thumbnails
                            ?.medium
                            ?.url ||

                        channel
                            ?.snippet
                            ?.thumbnails
                            ?.default
                            ?.url ||

                        channels[
                            channelIndex
                        ].thumbnail;


                    channels[
                        channelIndex
                    ].verified =
                        true;


                    channels[
                        channelIndex
                    ].lastUpdated =
                        formatDateTime(
                            new Date()
                        );
                }


            } catch (error) {

                console.log(
                    `Could not refresh ${savedChannel.name}:`,
                    error
                );


                failedChannels++;
            }

        }


        sortVideos();

        saveVideos();

        saveChannels();


        updateContent();


        alert(

            `Refresh complete.\n\n` +

            `Channels updated: ${successfulChannels}\n` +

            `Channels with errors: ${failedChannels}\n` +

            `Videos received: ${totalVideos}`

        );


    } finally {

        if (button) {

            button.disabled =
                false;

            button.textContent =
                "↻ Refresh All Channels";
        }
    }
}


/* =========================================
   FORMAT DATE AND TIME
   ========================================= */

function formatDateTime(
    date
) {

    if (!date) {
        return "";
    }


    return date.toLocaleString(
        "en-GB",
        {

            day:
                "2-digit",

            month:
                "short",

            year:
                "numeric",

            hour:
                "2-digit",

            minute:
                "2-digit"

        }
    );
}


/* =========================================
   ERROR MESSAGE
   ========================================= */

function showYouTubeError(
    error
) {

    if (
        error.message ===
        "NO_API_KEY"
    ) {

        alert(
            "No YouTube API key has been saved."
        );

        return;
    }


    if (
        error.message ===
        "CHANNEL_NOT_FOUND"
    ) {

        alert(
            "The YouTube channel could not be found."
        );

        return;
    }


    if (
        error.message ===
        "quotaExceeded"
    ) {

        alert(
            "The YouTube API daily quota has been exceeded."
        );

        return;
    }


    if (
        error.message ===
        "keyInvalid"
    ) {

        removeApiKey();


        alert(
            "The YouTube API key is invalid. It has been removed."
        );

        return;
    }


    if (
        error.message ===
        "forbidden"
    ) {

        alert(
            "YouTube rejected the API request. Please check the API key and YouTube Data API v3."
        );

        return;
    }


    alert(
        "Something went wrong while connecting to YouTube."
    );
}


/* =========================================
   DELETE CHANNEL
   ========================================= */

function setupChannelButtons() {

    document
        .querySelectorAll(
            ".channel-card"
        )
        .forEach(
            card => {

                const channelId =
                    card.getAttribute(
                        "data-channel-id"
                    );


                const deleteButton =
                    card.querySelector(
                        ".channel-delete-button"
                    );


                if (
                    !deleteButton
                ) {

                    return;
                }


                deleteButton.addEventListener(
                    "click",
                    () =>
                        deleteChannel(
                            channelId
                        )
                );

            }
        );
}


function deleteChannel(
    channelId
) {

    const channel =
        channels.find(
            item =>
                item.id ===
                channelId
        );


    if (!channel) {
        return;
    }


    const confirmed =
        confirm(
            `Delete "${channel.name}" from your channels?`
        );


    if (!confirmed) {
        return;
    }


    channels =
        channels.filter(
            item =>
                item.id !==
                channelId
        );


    saveChannels();

    updateContent();
}


/* =========================================
   START APPLICATION
   ========================================= */

function startApp() {

    videos =
        loadVideos();


    channels =
        loadChannels();


    sortVideos();

    setupNavigation();

    updateNavigation();

    updateContent();
}


/* =========================================
   START
   ========================================= */

document.addEventListener(
    "DOMContentLoaded",
    startApp
);
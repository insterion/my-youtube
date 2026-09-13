/* =========================================
   MY YOUTUBE
   Main application logic
   Version 0.7
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

    const savedVideos =
        localStorage.getItem(
            VIDEO_STORAGE_KEY
        );


    if (!savedVideos) {

        return [];
    }


    try {

        const parsedVideos =
            JSON.parse(savedVideos);


        if (!Array.isArray(parsedVideos)) {

            return [];
        }


        return parsedVideos;

    } catch (error) {

        console.log(
            "Could not read saved videos.",
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

    const savedChannels =
        localStorage.getItem(
            CHANNEL_STORAGE_KEY
        );


    if (!savedChannels) {

        return [];
    }


    try {

        const parsedChannels =
            JSON.parse(savedChannels);


        if (!Array.isArray(parsedChannels)) {

            return [];
        }


        return parsedChannels;

    } catch (error) {

        console.log(
            "Could not read saved channels.",
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
   CURRENT PAGE
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

    if (currentPage === "new") {

        return videos.filter(
            video =>
                !video.watched
        );
    }


    if (currentPage === "saved") {

        return videos.filter(
            video =>
                video.saved
        );
    }


    if (currentPage === "watched") {

        return videos.filter(
            video =>
                video.watched
        );
    }


    return [];
}


/* =========================================
   UPDATE MAIN CONTENT
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
   VIDEO CARD
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
   HTML SAFETY
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
        "No YouTube link is available for this video."
    );
}


/* =========================================
   TOGGLE WATCHED
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
   TOGGLE SAVED
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
   TOGGLE DOWNLOADED STATUS
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
       This is still only a status.

       No actual file is downloaded yet.
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

            button.addEventListener(
                "click",
                showAddChannelForm
            );

        }
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

                <p
                    class="api-key-saved"
                >
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
            type: "handle",
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
            type: "id",
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
            type: "username",
            value:
                path.substring(
                    "/user/".length
                )
        };
    }


    if (
        path.startsWith(
            "/c/"
        )
    ) {

        return {
            valid: true,
            type: "custom",
            value:
                path.substring(
                    "/c/".length
                )
        };
    }


    return {
        valid: false,
        type: null,
        value: null
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
   FIND YOUTUBE CHANNEL
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
    }


    else if (
        parsedUrl.type ===
        "id"
    ) {

        parameters.id =
            parsedUrl.value;
    }


    else if (
        parsedUrl.type ===
        "username"
    ) {

        parameters.forUsername =
            parsedUrl.value;
    }


    else if (
        parsedUrl.type ===
        "custom"
    ) {

        const searchResponse =
            await youtubeApiRequest(
                "search",
                {
                    part:
                        "snippet",

                    type:
                        "channel",

                    q:
                        parsedUrl.value,

                    maxResults:
                        "5"
                }
            );


        if (
            !searchResponse.items ||
            searchResponse.items.length === 0
        ) {

            throw new Error(
                "CHANNEL_NOT_FOUND"
            );
        }


        const firstResult =
            searchResponse.items[0];


        const channelId =
            firstResult
                .snippet
                .channelId;


        parameters = {

            part:
                "snippet,contentDetails",

            id:
                channelId
        };
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
            .contentDetails
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


                return {

                    id:
                        videoId,

                    title:
                        snippet?.title ||
                        "Untitled video",

                    channel:
                        snippet?.channelTitle ||
                        channel?.snippet?.title ||
                        "Unknown channel",

                    date:
                        formatYouTubeDate(
                            snippet?.publishedAt
                        ),

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

                        ""

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


    if (hours > 0) {

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


    if (minutes > 0) {

        if (seconds > 0) {

            return (
                `${minutes}m ` +
                `${String(
                    seconds
                ).padStart(
                    2,
                    "0"
                )}s`
            );
        }


        return `${minutes}m`;
    }


    return `${seconds}s`;
}


/* =========================================
   CONNECT YOUTUBE CHANNEL
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


    /*
       Save API key on first use.
    */

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

        /*
           Find real channel.
        */

        const channel =
            await findYouTubeChannel(
                parsedUrl
            );


        /*
           Get latest videos.
        */

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
                    ?.default
                    ?.url ||
                channel
                    ?.snippet
                    ?.thumbnails
                    ?.medium
                    ?.url ||
                "",

            verified:
                true,

            addedAt:
                new Date().toISOString()

        };


        /*
           Add or update channel.
        */

        const existingChannelIndex =
            channels.findIndex(
                item =>
                    item.id ===
                    channelId
            );


        if (
            existingChannelIndex >= 0
        ) {

            channels[
                existingChannelIndex
            ] =
                {
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


        /*
           Add or update videos.

           Existing Watched,
           Saved and Downloaded
           statuses are preserved.
        */

        latestVideos.forEach(
            newVideo => {

                const existingIndex =
                    videos.findIndex(
                        item =>
                            item.id ===
                            newVideo.id
                    );


                if (
                    existingIndex >= 0
                ) {

                    const oldVideo =
                        videos[
                            existingIndex
                        ];


                    videos[
                        existingIndex
                    ] = {

                        ...oldVideo,

                        title:
                            newVideo.title,

                        channel:
                            newVideo.channel,

                        date:
                            newVideo.date,

                        duration:
                            newVideo.duration,

                        youtubeUrl:
                            newVideo.youtubeUrl,

                        thumbnail:
                            newVideo.thumbnail
                    };

                } else {

                    videos.push(
                        newVideo
                    );
                }

            }
        );


        /*
           Sort by published date.
        */

        videos.sort(
            (
                first,
                second
            ) => {

                const firstDate =
                    new Date(
                        first.youtubePublishedAt ||
                        first.date
                    );


                const secondDate =
                    new Date(
                        second.youtubePublishedAt ||
                        second.date
                    );


                return (
                    secondDate -
                    firstDate
                );
            }
        );


        saveVideos();


        alert(
            `Connected to "${channelName}".\n\n${latestVideos.length} recent videos loaded.`
        );


        /*
           Go to New page.
        */

        currentPage =
            "new";


        saveCurrentPage();

        updateNavigation();

        updateContent();

    } catch (error) {

        console.log(
            "YouTube connection error:",
            error
        );


        if (
            error.message ===
            "NO_API_KEY"
        ) {

            alert(
                "No YouTube API key has been saved."
            );

        } else if (
            error.message ===
            "CHANNEL_NOT_FOUND"
        ) {

            alert(
                "The YouTube channel could not be found."
            );

        } else if (
            error.message ===
            "quotaExceeded"
        ) {

            alert(
                "The YouTube API daily quota has been exceeded."
            );

        } else if (
            error.message ===
            "keyInvalid"
        ) {

            removeApiKey();


            alert(
                "The YouTube API key is invalid. It has been removed."
            );

        } else if (
            error.message ===
            "forbidden"
        ) {

            alert(
                "YouTube rejected the API request. Please check your API key and YouTube Data API v3."
            );

        } else {

            alert(
                "Something went wrong while connecting to YouTube.\n\nPlease check the channel link, API key and YouTube Data API v3."
            );
        }

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
   CHANNEL DELETE
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


                if (!deleteButton) {
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
            `Delete "${channel.name}"?`
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
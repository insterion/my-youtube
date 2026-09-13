/* =========================================
   MY YOUTUBE
   Main application logic
   Version 0.6

   This version adds:
   - YouTube API connection
   - API key storage on the phone
   - Real channel validation
   - Real channel information
   - Latest uploaded videos
   ========================================= */


/* =========================================
   EXAMPLE VIDEOS
   ========================================= */

const videos = [

    {
        id: "example-video-1",
        title: "Example New Video",
        channel: "Example Channel",
        date: "12 Sep 2026",
        duration: "12 min",
        watched: false,
        saved: false,
        downloaded: false,
        youtubeUrl: ""
    },

    {
        id: "example-video-2",
        title: "Another Example Video",
        channel: "Another Channel",
        date: "11 Sep 2026",
        duration: "8 min",
        watched: false,
        saved: false,
        downloaded: false,
        youtubeUrl: ""
    }

];


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
        return videos;
    }


    try {

        const parsedVideos =
            JSON.parse(savedVideos);


        if (!Array.isArray(parsedVideos)) {
            return videos;
        }


        return parsedVideos;

    } catch (error) {

        console.log(
            "Could not read saved videos."
        );

        return videos;
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
            "Could not read saved channels."
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


    if (navButtons[activeIndex]) {

        navButtons[activeIndex]
            .classList.add("active");
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


    if (!videoList || !sectionTitle) {
        return;
    }


    if (currentPage === "channels") {

        renderChannelsPage();

        return;
    }


    if (currentPage === "new") {

        sectionTitle.textContent =
            "New Videos";

    } else if (currentPage === "saved") {

        sectionTitle.textContent =
            "Saved Videos";

    } else if (currentPage === "watched") {

        sectionTitle.textContent =
            "Watched Videos";
    }


    const visibleVideos =
        getVisibleVideos();


    if (visibleVideos.length === 0) {

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


    return `

        <article
            class="video-card"
            data-video-id="${escapeHtml(
                video.id
            )}"
        >

            <div class="thumbnail">

                <div class="thumbnail-placeholder">

                    VIDEO

                </div>

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

                    •
                    
                    ${escapeHtml(
                        video.duration
                    )}

                </p>


                <div class="video-actions">

                    <button
                        class="action-button watch-button"
                        type="button"
                    >
                        ▶ Watch
                    </button>


                    <button
                        class="action-button watched-button"
                        type="button"
                    >
                        ${watchedText}
                    </button>

                </div>


                <div
                    class="video-actions secondary-actions"
                >

                    <button
                        class="action-button download-button"
                        type="button"
                    >
                        ${downloadedText}
                    </button>


                    <button
                        class="action-button save-button"
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
        .forEach(card => {

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


            if (watchButton) {

                watchButton.addEventListener(
                    "click",
                    () =>
                        watchVideo(
                            videoId
                        )
                );
            }


            if (watchedButton) {

                watchedButton.addEventListener(
                    "click",
                    () =>
                        toggleWatched(
                            videoId
                        )
                );
            }


            if (saveButton) {

                saveButton.addEventListener(
                    "click",
                    () =>
                        toggleSaved(
                            videoId
                        )
                );
            }


            if (downloadButton) {

                downloadButton.addEventListener(
                    "click",
                    () =>
                        toggleDownloaded(
                            videoId
                        )
                );
            }

        });
}


/* =========================================
   WATCH VIDEO
   ========================================= */

function watchVideo(videoId) {

    const video =
        videos.find(
            item =>
                item.id === videoId
        );


    if (!video) {
        return;
    }


    if (video.youtubeUrl) {

        window.open(
            video.youtubeUrl,
            "_blank"
        );

        return;
    }


    alert(
        "This example video does not have a YouTube link yet."
    );
}


/* =========================================
   WATCHED
   ========================================= */

function toggleWatched(videoId) {

    const video =
        videos.find(
            item =>
                item.id === videoId
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

function toggleSaved(videoId) {

    const video =
        videos.find(
            item =>
                item.id === videoId
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
   DOWNLOAD STATUS
   ========================================= */

function toggleDownloaded(videoId) {

    const video =
        videos.find(
            item =>
                item.id === videoId
        );


    if (!video) {
        return;
    }


    /*
       Temporary status only.

       No file is downloaded yet.
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


    if (currentPage === "channels") {

        countElement.textContent =
            `${channels.length} channels`;

        return;
    }


    const newCount =
        videos.filter(
            video =>
                !video.watched
        ).length;


    if (newCount === 1) {

        countElement.textContent =
            "1 new";

    } else {

        countElement.textContent =
            `${newCount} new`;
    }
}


/* =========================================
   CHANNEL PAGE
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


    sectionTitle.textContent =
        "Channels";


    if (channels.length === 0) {

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

function createChannelCard(channel) {

    const statusText =
        channel.verified
            ? "✓ Connected to YouTube"
            : "Local channel";


    return `

        <article
            class="channel-card"
            data-channel-id="${escapeHtml(
                channel.id
            )}"
        >

            <div class="channel-card-header">

                <div>

                    <h3 class="channel-card-name">

                        ${escapeHtml(
                            channel.name
                        )}

                    </h3>


                    <p class="channel-card-url">

                        ${escapeHtml(
                            channel.url
                        )}

                    </p>


                    <p class="channel-card-url">

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
   ADD CHANNEL BUTTON
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
            ? ""
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


        <div class="form-actions">

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


    document
        .getElementById(
            "save-channel-button"
        )
        .addEventListener(
            "click",
            connectYouTubeChannel
        );


    document
        .getElementById(
            "cancel-channel-button"
        )
        .addEventListener(
            "click",
            () =>
                updateContent()
        );
}


/* =========================================
   URL PARSER
   ========================================= */

function parseYouTubeChannelUrl(url) {

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

        const handle =
            path
                .substring(1);


        if (!handle) {

            return {
                valid: false,
                type: null,
                value: null
            };
        }


        return {
            valid: true,
            type: "handle",
            value: handle
        };
    }


    if (
        path.startsWith(
            "/channel/"
        )
    ) {

        const channelId =
            path.substring(
                "/channel/".length
            );


        if (!channelId) {

            return {
                valid: false,
                type: null,
                value: null
            };
        }


        return {
            valid: true,
            type: "id",
            value: channelId
        };
    }


    if (
        path.startsWith(
            "/user/"
        )
    ) {

        const username =
            path.substring(
                "/user/".length
            );


        if (!username) {

            return {
                valid: false,
                type: null,
                value: null
            };
        }


        return {
            valid: true,
            type: "username",
            value: username
        };
    }


    if (
        path.startsWith(
            "/c/"
        )
    ) {

        const customName =
            path.substring(
                "/c/".length
            );


        if (!customName) {

            return {
                valid: false,
                type: null,
                value: null
            };
        }


        return {
            valid: true,
            type: "custom",
            value: customName
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

        /*
           Older /c/ addresses are not
           directly supported by channels.list.

           We use YouTube search to find
           the channel.
        */

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


        /*
           Use the first matching channel
           for now.
        */

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
            .relatedPlaylists
            .uploads;


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
                        .contentDetails
                        .videoId
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
        new Map(
            videoResponse.items
                .map(
                    item =>
                        [
                            item.id,
                            item
                        ]
                )
        );


    return playlistResponse.items
        .map(
            item => {

                const videoId =
                    item
                        .contentDetails
                        .videoId;


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
                        snippet.title,

                    channel:
                        snippet.channelTitle,

                    date:
                        formatYouTubeDate(
                            snippet.publishedAt
                        ),

                    duration:
                        details
                            ? formatDuration(
                                details
                                    .contentDetails
                                    .duration
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
                            .thumbnails
                            ?.medium
                            ?.url ||
                        snippet
                            .thumbnails
                            ?.default
                            ?.url ||
                        ""

                };

            }
        );
}


/* =========================================
   ISO DATE
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
            day: "2-digit",
            month: "short",
            year: "numeric"
        }
    );
}


/* =========================================
   ISO 8601 DURATION
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

        return `${hours}h ${String(minutes).padStart(2, "0")}m`;

    }


    if (minutes > 0) {

        return `${minutes}m`;

    }


    return `${seconds}s`;
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


    /*
       Save API key if this is the
       first time we are using it.
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
           Find the actual channel.
        */

        const channel =
            await findYouTubeChannel(
                parsedUrl
            );


        /*
           Download the latest videos.
        */

        const latestVideos =
            await loadChannelVideos(
                channel
            );


        /*
           Create channel data.
        */

        const channelId =
            channel.id;


        const uploadsPlaylistId =
            channel
                .contentDetails
                .relatedPlaylists
                .uploads;


        const channelName =
            channel
                .snippet
                .title;


        const channelUrl =
            `https://www.youtube.com/channel/${channelId}`;


        /*
           Check if already added.
        */

        const existingIndex =
            channels.findIndex(
                item =>
                    item.id === channelId
            );


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
                    .snippet
                    .thumbnails
                    ?.default
                    ?.url ||
                "",

            verified:
                true,

            addedAt:
                new Date().toISOString()
        };


        if (
            existingIndex >= 0
        ) {

            channels[
                existingIndex
            ] =
                newChannel;

        } else {

            channels.push(
                newChannel
            );
        }


        saveChannels();


        /*
           Add new videos.

           Do not destroy watched,
           saved or downloaded states
           if a video already exists.
        */

        latestVideos.forEach(
            newVideo => {

                const existingVideo =
                    videos.find(
                        item =>
                            item.id ===
                            newVideo.id
                    );


                if (
                    existingVideo
                ) {

                    existingVideo.title =
                        newVideo.title;

                    existingVideo.channel =
                        newVideo.channel;

                    existingVideo.date =
                        newVideo.date;

                    existingVideo.duration =
                        newVideo.duration;

                    existingVideo.youtubeUrl =
                        newVideo.youtubeUrl;

                    existingVideo.thumbnail =
                        newVideo.thumbnail;

                } else {

                    videos.push(
                        newVideo
                    );
                }

            }
        );


        /*
           Sort newest first.
        */

        videos.sort(
            (
                first,
                second
            ) => {

                const firstDate =
                    new Date(
                        first.date
                    );

                const secondDate =
                    new Date(
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
            "forbidden"
        ) {

            alert(
                "YouTube rejected the API request. Check that YouTube Data API v3 is enabled and your API key is correct."
            );

        } else if (
            error.message ===
            "keyInvalid"
        ) {

            removeApiKey();


            alert(
                "The YouTube API key is invalid. It has been removed. Please try again with the correct key."
            );

        } else {

            alert(
                "Something went wrong while connecting to YouTube.\n\nPlease check the channel link, your API key, and that YouTube Data API v3 is enabled."
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
        .forEach(card => {

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

        });
}


function deleteChannel(
    channelId
) {

    const channel =
        channels.find(
            item =>
                item.id === channelId
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
                item.id !== channelId
        );


    saveChannels();

    updateContent();
}


/* =========================================
   START APPLICATION
   ========================================= */

function startApp() {

    const savedVideos =
        loadVideos();


    savedVideos.forEach(
        savedVideo => {

            const video =
                videos.find(
                    item =>
                        item.id ===
                        savedVideo.id
                );


            if (!video) {
                return;
            }


            video.watched =
                Boolean(
                    savedVideo.watched
                );


            video.saved =
                Boolean(
                    savedVideo.saved
                );


            video.downloaded =
                Boolean(
                    savedVideo.downloaded
                );


            video.youtubeUrl =
                savedVideo.youtubeUrl ||
                video.youtubeUrl ||
                "";


            video.thumbnail =
                savedVideo.thumbnail ||
                video.thumbnail ||
                "";

        }
    );


    channels =
        loadChannels();


    setupNavigation();

    updateNavigation();

    updateContent();
}


/* ========================================
   START
   ========================================= */

document.addEventListener(
    "DOMContentLoaded",
    startApp
);
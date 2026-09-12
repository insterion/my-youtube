/* =========================================
   MY YOUTUBE
   Main application logic
   Version 0.3
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

        downloaded: false
    },


    {
        id: "example-video-2",

        title: "Another Example Video",

        channel: "Another Channel",

        date: "11 Sep 2026",

        duration: "8 min",

        watched: false,

        saved: false,

        downloaded: false
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


/* =========================================
   CHANNEL DATA
   ========================================= */

let channels = [];


/* =========================================
   CURRENT PAGE
   ========================================= */

let currentPage =
    localStorage.getItem(PAGE_STORAGE_KEY) || "new";


/* =========================================
   LOAD VIDEOS
   ========================================= */

function loadVideos() {

    const savedVideos =
        localStorage.getItem(VIDEO_STORAGE_KEY);


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


/* =========================================
   SAVE VIDEOS
   ========================================= */

function saveVideos() {

    localStorage.setItem(
        VIDEO_STORAGE_KEY,
        JSON.stringify(videos)
    );
}


/* =========================================
   LOAD CHANNELS
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


/* =========================================
   SAVE CHANNELS
   ========================================= */

function saveChannels() {

    localStorage.setItem(
        CHANNEL_STORAGE_KEY,
        JSON.stringify(channels)
    );
}


/* =========================================
   SAVE CURRENT PAGE
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


    navButtons.forEach((button, index) => {

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

    });
}


/* =========================================
   UPDATE NAVIGATION
   ========================================= */

function updateNavigation() {

    const navButtons =
        document.querySelectorAll(
            ".nav-button"
        );


    navButtons.forEach(button => {

        button.classList.remove(
            "active"
        );

    });


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
   GET VIDEOS FOR CURRENT PAGE
   ========================================= */

function getVisibleVideos() {

    if (currentPage === "new") {

        return videos.filter(
            video => !video.watched
        );
    }


    if (currentPage === "saved") {

        return videos.filter(
            video => video.saved
        );
    }


    if (currentPage === "watched") {

        return videos.filter(
            video => video.watched
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
            .map(video =>
                createVideoCard(video)
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


    return `

        <article
            class="video-card"
            data-video-id="${escapeHtml(video.id)}"
        >

            <div class="thumbnail">

                <div class="thumbnail-placeholder">
                    VIDEO
                </div>

            </div>


            <div class="video-info">

                <h3>
                    ${escapeHtml(video.title)}
                </h3>


                <p class="channel-name">
                    ${escapeHtml(video.channel)}
                </p>


                <p class="video-date">
                    ${escapeHtml(video.date)}
                    •
                    ${escapeHtml(video.duration)}
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


                <div class="video-actions secondary-actions">

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
   SAFE TEXT
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
                        watchVideo(videoId)
                );
            }


            if (watchedButton) {

                watchedButton.addEventListener(
                    "click",
                    () =>
                        toggleWatched(videoId)
                );
            }


            if (saveButton) {

                saveButton.addEventListener(
                    "click",
                    () =>
                        toggleSaved(videoId)
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
            item => item.id === videoId
        );


    if (!video) {
        return;
    }


    alert(
        "The real YouTube link will be connected later."
    );
}


/* =========================================
   TOGGLE WATCHED
   ========================================= */

function toggleWatched(videoId) {

    const video =
        videos.find(
            item => item.id === videoId
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

function toggleSaved(videoId) {

    const video =
        videos.find(
            item => item.id === videoId
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
   TEMPORARY DOWNLOAD STATUS
   ========================================= */

function toggleDownloaded(videoId) {

    const video =
        videos.find(
            item => item.id === videoId
        );


    if (!video) {
        return;
    }


    /*
       This is only a temporary status.

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


    const newCount =
        videos.filter(
            video => !video.watched
        ).length;


    if (currentPage === "channels") {

        countElement.textContent =
            `${channels.length} channels`;

        return;
    }


    if (newCount === 1) {

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
                .map(channel =>
                    createChannelCard(channel)
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
   CREATE CHANNEL CARD
   ========================================= */

function createChannelCard(channel) {

    return `

        <article
            class="channel-card"
            data-channel-id="${escapeHtml(channel.id)}"
        >

            <div class="channel-card-header">

                <div>

                    <h3 class="channel-card-name">
                        ${escapeHtml(channel.name)}
                    </h3>


                    <p class="channel-card-url">
                        ${escapeHtml(channel.url)}
                    </p>

                </div>

            </div>


            <div class="channel-card-actions">

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


    buttons.forEach(button => {

        button.addEventListener(
            "click",
            showAddChannelForm
        );

    });
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


    const existingForm =
        document.querySelector(
            ".channel-form"
        );


    if (existingForm) {
        return;
    }


    const form =
        document.createElement("div");


    form.className =
        "channel-form";


    form.innerHTML = `

        <h3>
            Add YouTube Channel
        </h3>


        <label>

            Channel name

            <input
                type="text"
                id="channel-name-input"
                placeholder="Example Channel"
                autocomplete="off"
            >

        </label>


        <label>

            YouTube channel URL

            <input
                type="url"
                id="channel-url-input"
                placeholder="https://youtube.com/@channel"
                autocomplete="off"
            >

        </label>


        <div class="form-actions">

            <button
                class="form-button form-save-button"
                id="save-channel-button"
                type="button"
            >
                Add channel
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


    videoList.prepend(form);


    document
        .getElementById(
            "save-channel-button"
        )
        .addEventListener(
            "click",
            saveNewChannel
        );


    document
        .getElementById(
            "cancel-channel-button"
        )
        .addEventListener(
            "click",
            () => updateContent()
        );
}


/* =========================================
   SAVE NEW CHANNEL
   ========================================= */

function saveNewChannel() {

    const nameInput =
        document.getElementById(
            "channel-name-input"
        );


    const urlInput =
        document.getElementById(
            "channel-url-input"
        );


    if (!nameInput || !urlInput) {
        return;
    }


    const name =
        nameInput.value.trim();


    const url =
        urlInput.value.trim();


    if (!name) {

        alert(
            "Please enter the channel name."
        );

        return;
    }


    if (!url) {

        alert(
            "Please enter the YouTube channel URL."
        );

        return;
    }


    const alreadyExists =
        channels.some(
            channel =>
                channel.url.toLowerCase() ===
                url.toLowerCase()
        );


    if (alreadyExists) {

        alert(
            "This channel has already been added."
        );

        return;
    }


    const newChannel = {

        id:
            "channel-" +
            Date.now(),

        name: name,

        url: url,

        addedAt:
            new Date().toISOString()
    };


    channels.push(
        newChannel
    );


    saveChannels();

    updateContent();
}


/* =========================================
   DELETE CHANNEL
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


/* =========================================
   DELETE CHANNEL ACTION
   ========================================= */

function deleteChannel(channelId) {

    const channel =
        channels.find(
            item => item.id === channelId
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
            item => item.id !== channelId
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

        }
    );


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
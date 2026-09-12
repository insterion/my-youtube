/* =========================================
   MY YOUTUBE
   Main application logic
   Version 0.2
   ========================================= */


/* ---------- Example videos ---------- */

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


/* ---------- Storage ---------- */

const STORAGE_KEY = "my-youtube-videos";

const PAGE_KEY = "my-youtube-page";


function loadVideos() {

    const savedVideos = localStorage.getItem(STORAGE_KEY);

    if (!savedVideos) {
        return videos;
    }

    try {

        const parsedVideos = JSON.parse(savedVideos);

        if (!Array.isArray(parsedVideos)) {
            return videos;
        }

        return parsedVideos;

    } catch (error) {

        console.log("Could not read saved videos.");

        return videos;
    }
}


function saveVideos() {

    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(videos)
    );
}


/* ---------- Current page ---------- */

let currentPage =
    localStorage.getItem(PAGE_KEY) || "new";


function saveCurrentPage() {

    localStorage.setItem(
        PAGE_KEY,
        currentPage
    );
}


/* ---------- Navigation ---------- */

function setupNavigation() {

    const navButtons =
        document.querySelectorAll(".nav-button");


    navButtons.forEach((button, index) => {

        button.addEventListener("click", () => {

            const pages = [
                "new",
                "saved",
                "watched",
                "channels"
            ];

            currentPage = pages[index];

            saveCurrentPage();

            updateNavigation();

            updateContent();
        });

    });
}


function updateNavigation() {

    const navButtons =
        document.querySelectorAll(".nav-button");


    navButtons.forEach(button => {

        button.classList.remove("active");

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


/* ---------- Video filtering ---------- */

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


/* ---------- Update page ---------- */

function updateContent() {

    const videoList =
        document.querySelector(".video-list");


    const sectionTitle =
        document.querySelector(".section-header h2");


    const visibleVideos =
        getVisibleVideos();


    /*
       Channels page is different from
       the video pages.
    */

    if (currentPage === "channels") {

        sectionTitle.textContent = "Channels";


        videoList.innerHTML = `

            <div class="empty-state">

                <div class="empty-icon">
                    ▣
                </div>

                <h3>
                    No channels yet
                </h3>

                <p>
                    Your YouTube channels will
                    appear here.
                </p>

                <button
                    class="add-channel-button"
                    type="button"
                >
                    + Add channel
                </button>

            </div>

        `;


        updateNewVideoCount();

        return;
    }


    /*
       Normal video pages.
    */

    if (currentPage === "new") {

        sectionTitle.textContent = "New Videos";

    } else if (currentPage === "saved") {

        sectionTitle.textContent = "Saved Videos";

    } else if (currentPage === "watched") {

        sectionTitle.textContent = "Watched Videos";
    }


    /*
       No videos message.
    */

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


    /*
       Build video cards.
    */

    videoList.innerHTML =
        visibleVideos
            .map(video => createVideoCard(video))
            .join("");


    setupVideoButtons();

    updateNewVideoCount();
}


/* ---------- Create video card ---------- */

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
            data-video-id="${video.id}"
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


/* ---------- Safe text ---------- */

function escapeHtml(text) {

    return String(text)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


/* ---------- Video buttons ---------- */

function setupVideoButtons() {

    document
        .querySelectorAll(".video-card")
        .forEach(card => {

            const videoId =
                card.getAttribute("data-video-id");


            const watchButton =
                card.querySelector(".watch-button");


            const watchedButton =
                card.querySelector(".watched-button");


            const saveButton =
                card.querySelector(".save-button");


            const downloadButton =
                card.querySelector(".download-button");


            if (watchButton) {

                watchButton.addEventListener(
                    "click",
                    () => watchVideo(videoId)
                );
            }


            if (watchedButton) {

                watchedButton.addEventListener(
                    "click",
                    () => toggleWatched(videoId)
                );
            }


            if (saveButton) {

                saveButton.addEventListener(
                    "click",
                    () => toggleSaved(videoId)
                );
            }


            if (downloadButton) {

                downloadButton.addEventListener(
                    "click",
                    () => toggleDownloaded(videoId)
                );
            }

        });
}


/* ---------- Watched ---------- */

function toggleWatched(videoId) {

    const video =
        videos.find(item => item.id === videoId);


    if (!video) {
        return;
    }


    video.watched =
        !video.watched;


    saveVideos();

    updateContent();
}


/* ---------- Saved ---------- */

function toggleSaved(videoId) {

    const video =
        videos.find(item => item.id === videoId);


    if (!video) {
        return;
    }


    video.saved =
        !video.saved;


    saveVideos();

    updateContent();
}


/* ---------- Download ---------- */

function toggleDownloaded(videoId) {

    const video =
        videos.find(item => item.id === videoId);


    if (!video) {
        return;
    }


    /*
       Temporary test only.

       This does NOT download a file yet.
    */

    video.downloaded =
        !video.downloaded;


    saveVideos();

    updateContent();
}


/* ---------- Watch ---------- */

function watchVideo(videoId) {

    const video =
        videos.find(item => item.id === videoId);


    if (!video) {
        return;
    }


    alert(
        "The real YouTube link will be connected later."
    );
}


/* ---------- New video counter ---------- */

function updateNewVideoCount() {

    const countElement =
        document.querySelector(".video-count");


    if (!countElement) {
        return;
    }


    const newCount =
        videos.filter(
            video => !video.watched
        ).length;


    if (currentPage === "channels") {

        countElement.textContent =
            `${videos.length} videos`;

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


/* ---------- Start application ---------- */

function startApp() {

    const savedVideos =
        loadVideos();


    /*
       Restore saved status.
    */

    savedVideos.forEach(savedVideo => {

        const video =
            videos.find(
                item => item.id === savedVideo.id
            );


        if (!video) {
            return;
        }


        video.watched =
            Boolean(savedVideo.watched);


        video.saved =
            Boolean(savedVideo.saved);


        video.downloaded =
            Boolean(savedVideo.downloaded);
    });


    setupNavigation();

    updateNavigation();

    updateContent();
}


/* ---------- Start ---------- */

document.addEventListener(
    "DOMContentLoaded",
    startApp
);
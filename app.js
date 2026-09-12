/* =========================================
   MY YOUTUBE
   Main application logic
   Version 0.1
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


/* ---------- Local storage ---------- */

const STORAGE_KEY = "my-youtube-videos";


function loadVideos() {

    const savedVideos = localStorage.getItem(STORAGE_KEY);

    if (savedVideos) {
        try {
            return JSON.parse(savedVideos);
        } catch (error) {
            console.log("Could not read saved videos.");
        }
    }

    return videos;
}


function saveVideos() {

    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(videos)
    );
}


/* ---------- Update video list ---------- */

function updateVideoList() {

    videos.forEach(video => {

        const card = document.querySelector(
            `[data-video-id="${video.id}"]`
        );

        if (!card) {
            return;
        }


        /* Watched button */

        const watchedButton =
            card.querySelector(".watched-button");

        if (video.watched) {

            watchedButton.textContent = "✓ Watched";
            watchedButton.classList.add("is-active");

        } else {

            watchedButton.textContent = "○ Watched";
            watchedButton.classList.remove("is-active");
        }


        /* Save button */

        const saveButton =
            card.querySelector(".save-button");

        if (video.saved) {

            saveButton.textContent = "★ Saved";
            saveButton.classList.add("is-active");

        } else {

            saveButton.textContent = "☆ Save";
            saveButton.classList.remove("is-active");
        }


        /* Download button */

        const downloadButton =
            card.querySelector(".download-button");

        if (video.downloaded) {

            downloadButton.textContent = "✓ Downloaded";
            downloadButton.classList.add("is-active");

        } else {

            downloadButton.textContent = "↓ Download";
            downloadButton.classList.remove("is-active");
        }

    });


    updateNewVideoCount();
}


/* ---------- New video counter ---------- */

function updateNewVideoCount() {

    const newCount = videos.filter(
        video => !video.watched
    ).length;


    const countElement =
        document.querySelector(".video-count");


    if (!countElement) {
        return;
    }


    if (newCount === 1) {

        countElement.textContent = "1 new";

    } else {

        countElement.textContent =
            `${newCount} new`;
    }
}


/* ---------- Watched button ---------- */

function toggleWatched(videoId) {

    const video = videos.find(
        item => item.id === videoId
    );

    if (!video) {
        return;
    }


    video.watched = !video.watched;

    saveVideos();

    updateVideoList();
}


/* ---------- Save button ---------- */

function toggleSaved(videoId) {

    const video = videos.find(
        item => item.id === videoId
    );

    if (!video) {
        return;
    }


    video.saved = !video.saved;

    saveVideos();

    updateVideoList();
}


/* ---------- Download button ---------- */

function toggleDownloaded(videoId) {

    const video = videos.find(
        item => item.id === videoId
    );

    if (!video) {
        return;
    }


    /*
       This is only a temporary test.

       We are NOT downloading anything yet.

       Later this button will connect
       to our proper download system.
    */

    video.downloaded = !video.downloaded;

    saveVideos();

    updateVideoList();
}


/* ---------- Watch button ---------- */

function watchVideo(videoId) {

    const video = videos.find(
        item => item.id === videoId
    );

    if (!video) {
        return;
    }


    /*
       For now there is no real YouTube URL.

       Later this will open the actual
       YouTube video.
    */

    alert(
        "YouTube video opening will be connected later."
    );
}


/* ---------- Connect buttons ---------- */

function setupButtons() {

    document.querySelectorAll(".video-card").forEach(card => {

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


/* ---------- Start application ---------- */

function startApp() {

    const savedVideos =
        loadVideos();


    /*
       Copy saved values back into our
       current video list.
    */

    savedVideos.forEach(savedVideo => {

        const video = videos.find(
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


    setupButtons();

    updateVideoList();
}


/* ---------- Run ---------- */

document.addEventListener(
    "DOMContentLoaded",
    startApp
);
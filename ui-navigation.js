/* ==============================================
   MY YOUTUBE — UI & NAVIGATION
   Maintenance 1.3.6 (2026-11-02)

   Existing page switching, rendering dispatch,
   library UI controls and header counter moved
   unchanged from app.js.

   This is a classic (non-module) script, loaded
   after storage/backup helpers and before app.js.
   Functions run only after app.js has created its
   shared state; browser global bindings are shared
   across these classic scripts.
   ============================================== */

/* Saved page selection */
function saveCurrentPage() {
    localStorage.setItem(PAGE_STORAGE_KEY, currentPage);
}


// The Home overview is the first tab. Existing pages stay in their usual order.
// Keep this programmatic so previous index.html layouts and saved data work.
function setupSearchNavigation() {
    const navigation = document.querySelector(".bottom-navigation");
    if (!navigation) return;

    if (!navigation.querySelector("#home-nav-button")) {
        const home = document.createElement("button");
        home.id = "home-nav-button";
        home.className = "nav-button";
        home.type = "button";
        home.innerHTML = '<span class="nav-icon" aria-hidden="true">⌂</span><span>Home</span>';
        navigation.prepend(home);
    }

    if (!navigation.querySelector("#search-nav-button")) {
        const search = document.createElement("button");
        search.id = "search-nav-button";
        search.className = "nav-button";
        search.type = "button";
        search.innerHTML = '<span class="nav-icon" aria-hidden="true">⌕</span><span>Search</span>';
        navigation.appendChild(search);
    }
    navigation.style.gridTemplateColumns = "repeat(6, minmax(0, 1fr))";
}

/* =========================================
   NAVIGATION
   ========================================= */

const APP_PAGES = ["home", "new", "saved", "watched", "channels", "search", "queue", "feed"];

function navigateToPage(page) {
    if (!APP_PAGES.includes(page)) return;
    // Always open the channel list when arriving through the main navigation.
    activeChannelId = null;
    activeChannelVideoFilter = "all";
    // Selections never carry across tabs, avoiding accidental edits elsewhere.
    librarySelectMode = false;
    librarySelectedIds.clear();
    currentPage = page;
    saveCurrentPage();
    updateNavigation();
    updateContent();
    window.scrollTo(0, 0);
}

function setupNavigation() {
    document.querySelectorAll(".nav-button").forEach((button, index) => {
        const page = APP_PAGES[index];
        if (!page) return;
        button.dataset.appPage = page;
        button.addEventListener("click", () => navigateToPage(page));
    });
}

function updateNavigation() {
    document.querySelectorAll(".nav-button").forEach(button => {
        const active = button.dataset.appPage === currentPage;
        button.classList.toggle("active", active);
        if (active) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
    });
}


/* Settings button binding; modal remains in app.js */
function setupSettingsButton() {
    const button = document.querySelector(".settings-button");
    if (button) button.addEventListener("click", openSettings);
}


/* UI screen dispatcher, library controls, badges and refresh button */
function updateContent() {
    const videoList = document.querySelector(".video-list");
    const sectionTitle = document.querySelector(".section-header h2");
    if (!videoList || !sectionTitle) return;

    if (currentPage === "home") {
        renderHomePage();
        return;
    }
    if (currentPage === "channels") {
        renderChannelsPage();
        return;
    }
    if (currentPage === "queue") {
        renderQueuePage();
        return;
    }
    if (currentPage === "feed") {
        renderSmartFeedPage();
        return;
    }
    if (currentPage === "search") {
        renderSearchPage();
        updateNewVideoCount();
        return;
    }
    if (!LIBRARY_PAGES.includes(currentPage)) return;

    const names = { new: "New Videos", saved: "Saved Videos", watched: "Watched Videos" };
    sectionTitle.textContent = names[currentPage];
    addRefreshButton();

    const prefs = libraryViewPrefs[currentPage];
    const activeVideos = getVisibleVideos();
    const recent = currentPage === "new"
        ? videos.filter(video => !video.hidden && !video.isNew && !video.watched &&
            channels.some(channel => channel.id === video.channelId)).slice(0, 30)
        : [];
    const channelNames = [...new Set([...activeVideos, ...recent]
        .map(video => video.channel || "Unknown channel"))]
        .sort((a, b) => a.localeCompare(b));
    // A deleted channel filter should not silently hide all videos forever.
    if (prefs.channel && !channelNames.includes(prefs.channel)) {
        prefs.channel = "";
        saveLibraryViewPrefs();
    }

    videoList.innerHTML = `
        <section class="library-tools" aria-label="Video library controls">
            <div class="library-tools-heading">
                <h3>My video library</h3>
                <span>Search and organise videos already on this device</span>
            </div>
            <label for="library-filter-query">Find a video
                <input id="library-filter-query" type="search" maxlength="150"
                    placeholder="Video title or channel"
                    value="${escapeHtml(prefs.query)}" autocomplete="off">
            </label>
            <div class="library-filter-grid">
                <label for="library-filter-channel">Channel
                    <select id="library-filter-channel">
                        <option value="">All channels</option>
                        ${channelNames.map(name => `<option value="${escapeHtml(name)}"
                            ${name === prefs.channel ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}
                    </select>
                </label>
                <label for="library-filter-sort">Order
                    <select id="library-filter-sort">
                        <option value="newest" ${prefs.sort === "newest" ? "selected" : ""}>Newest first</option>
                        <option value="oldest" ${prefs.sort === "oldest" ? "selected" : ""}>Oldest first</option>
                        <option value="longest" ${prefs.sort === "longest" ? "selected" : ""}>Longest first</option>
                        <option value="shortest" ${prefs.sort === "shortest" ? "selected" : ""}>Shortest first</option>
                    </select>
                </label>
            </div>
            ${currentPage === "saved" ? `
                <p id="saved-library-overview" class="saved-library-overview"></p>
                <div class="library-filter-grid saved-extra-filters" aria-label="Saved library filters">
                    <label for="saved-watch-filter">Watch status
                        <select id="saved-watch-filter">
                            <option value="all" ${prefs.savedWatch === "all" ? "selected" : ""}>All saved</option>
                            <option value="unwatched" ${prefs.savedWatch === "unwatched" ? "selected" : ""}>Not watched</option>
                            <option value="watched" ${prefs.savedWatch === "watched" ? "selected" : ""}>Watched</option>
                        </select>
                    </label>
                    <label for="saved-queue-filter">Watch Queue
                        <select id="saved-queue-filter">
                            <option value="all" ${prefs.savedQueue === "all" ? "selected" : ""}>Any Queue status</option>
                            <option value="queued" ${prefs.savedQueue === "queued" ? "selected" : ""}>Already in Queue</option>
                            <option value="notqueued" ${prefs.savedQueue === "notqueued" ? "selected" : ""}>Not in Queue</option>
                        </select>
                    </label>
                </div>` : ""}
            <div class="library-tool-actions">
                <button type="button" id="library-open-queue" class="library-queue-shortcut">▶ Watch Queue (${watchQueue.length})</button>
                <button id="library-compact-toggle" type="button"
                    aria-pressed="${prefs.compact}">
                    ${prefs.compact ? "▦ Show thumbnails" : "☷ Compact list"}
                </button>
                <button id="library-clear-filters" type="button">Clear filters</button>
            </div>
            <div class="library-bulk-controls">
                <button id="library-select-toggle" class="library-select-toggle" type="button"
                    aria-pressed="${librarySelectMode}">
                    ${librarySelectMode ? "✕ Done selecting" : "☑ Select videos"}
                </button>
                <div id="library-bulk-panel" class="library-bulk-panel" ${librarySelectMode ? "" : "hidden"}>
                    <p id="library-selected-count" class="bulk-selected-count" role="status">0 videos selected</p>
                    <div class="library-bulk-choices">
                        <button id="library-select-all" type="button">Select all shown</button>
                        <button id="library-clear-selection" type="button">Clear selection</button>
                    </div>
                    <div class="library-bulk-actions">
                        ${currentPage === "watched" ?
                            '<button type="button" data-bulk-action="unwatched">○ Mark unwatched</button>' :
                            '<button type="button" data-bulk-action="watched">✓ Mark watched</button>'}
                        ${currentPage === "saved" ?
                            '<button type="button" data-bulk-action="unsave">☆ Unsave</button>' :
                            '<button type="button" data-bulk-action="save">★ Save</button>'}
                        <button type="button" data-bulk-action="queue">＋ Add to Queue</button>
                        <button type="button" data-bulk-action="hide" class="bulk-hide-action">◌ Hide</button>
                        ${currentPage === "saved" ? `
                            <button type="button" data-bulk-action="copy">⧉ Copy links</button>
                            <button type="button" data-bulk-action="download">↓ Download .txt</button>` : ""}
                    </div>
                    ${currentPage === "saved" ? '<p id="saved-bulk-message" class="saved-bulk-feedback" role="status" aria-live="polite"></p>' : ""}
                    <p class="library-bulk-note">Only videos shown with the current filters are selected.
                        Hidden videos can be restored in Settings.</p>
                </div>
            </div>
            <p id="library-results-summary" role="status" aria-live="polite"></p>
        </section>
        <div id="library-results" class="library-results"></div>
    `;
    setupLibraryControls();
    renderLibraryResults();
    updateNewVideoCount();
}

function updateNewVideoCount() {
    const count = videos.filter(
        video => !video.hidden && video.isNew && !video.watched
    ).length;

    // Update the counter already present in index.html.
    const headerCount = document.querySelector(".video-count");

    if (headerCount) {
        headerCount.textContent = `${count} new`;
        headerCount.style.display = currentPage === "new" ? "" : "none";
    }

    // The New tab is selected by page name, not its position in navigation.
    const newButton = document.querySelector('.nav-button[data-app-page="new"]');
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


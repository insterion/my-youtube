/* ==============================================
   MY YOUTUBE — UI & NAVIGATION
   Navigation update 1.4.8 (2026-11-09)

   Existing page switching, rendering dispatch,
   library UI controls and header counter moved
   unchanged from app.js.

   This is a classic (non-module) script, loaded
   after storage/backup helpers and before app.js.
   Functions run only after app.js has created its
   shared state; browser global bindings are shared
   across these classic scripts.
   ============================================== */

/* The available pages remain available to the application even when their
   bottom-navigation button is hidden. Hiding tabs never edits a video record. */
const NAV_TAB_DEFINITIONS = [
    { id: "home", label: "Home", icon: "⌂" },
    { id: "new", label: "New", icon: "●" },
    { id: "saved", label: "Saved", icon: "☆" },
    { id: "watched", label: "Watched", icon: "✓" },
    { id: "channels", label: "Channels", icon: "▣" },
    { id: "search", label: "Search", icon: "⌕" },
    { id: "queue", label: "Watch Queue", navLabel: "Queue", icon: "▶" },
    { id: "feed", label: "Smart Feed", navLabel: "Feed", icon: "≋" }
];
const APP_PAGES = NAV_TAB_DEFINITIONS.map(tab => tab.id);
const NAV_VISIBILITY_KEY = "my-youtube-visible-tabs-v1";
const NAV_DEFAULT_VISIBILITY = {
    home: true, new: true, saved: false, watched: false,
    channels: true, search: true, queue: true, feed: true
};

function normalizeNavVisibility(value) {
    const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return Object.fromEntries(NAV_TAB_DEFINITIONS.map(tab => [
        tab.id, tab.id === "home" ? true :
            (typeof raw[tab.id] === "boolean" ? raw[tab.id] : NAV_DEFAULT_VISIBILITY[tab.id])
    ]));
}

function loadNavVisibility() {
    try {
        const raw = localStorage.getItem(NAV_VISIBILITY_KEY);
        return normalizeNavVisibility(raw === null ? null : JSON.parse(raw));
    } catch (error) {
        console.warn("Could not read visible tab settings; using safe defaults.", error);
        return normalizeNavVisibility(null);
    }
}

let navVisibility = loadNavVisibility();

function saveCurrentPage() {
    localStorage.setItem(PAGE_STORAGE_KEY, currentPage);
}

function renderNavigationTabs() {
    const navigation = document.querySelector(".bottom-navigation");
    if (!navigation) return;
    navigation.setAttribute("aria-label", "Main navigation");
    const visible = NAV_TAB_DEFINITIONS.filter(tab => navVisibility[tab.id]);
    const fragment = document.createDocumentFragment();
    visible.forEach(tab => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "nav-button";
        button.dataset.appPage = tab.id;
        button.id = `${tab.id}-nav-button`;
        button.setAttribute("aria-label", tab.label);
        const icon = document.createElement("span");
        icon.className = "nav-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = tab.icon;
        const label = document.createElement("span");
        label.textContent = tab.navLabel || tab.label;
        button.append(icon, label);
        fragment.appendChild(button);
    });
    navigation.replaceChildren(fragment);
    const twoRows = visible.length > 6;
    navigation.classList.toggle("nav-two-rows", twoRows);
    document.body.classList.toggle("has-two-row-nav", twoRows);
    navigation.style.gridTemplateColumns = `repeat(${twoRows ? 4 : visible.length}, minmax(0, 1fr))`;
    updateNavigation();
}

function setNavTabVisible(page, visible) {
    if (page === "home" || !APP_PAGES.includes(page) || typeof visible !== "boolean") return false;
    const next = { ...navVisibility, [page]: visible };
    // Only accept a change after it has been stored. If storage is unavailable,
    // keep the last rendered choice and do not mislead the user.
    try { localStorage.setItem(NAV_VISIBILITY_KEY, JSON.stringify(next)); }
    catch (error) {
        console.warn("Could not save visible tab settings.", error);
        return false;
    }
    navVisibility = next;
    if (!visible && page === currentPage) {
        currentPage = "home";
        try { saveCurrentPage(); }
        catch (error) { console.warn("Could not remember Home page.", error); }
        updateContent();
    }
    renderNavigationTabs();
    return true;
}

function setupSearchNavigation() {
    // Last session may have closed on a now-hidden tab: open Home instead.
    // Direct shortcuts inside the app can still explicitly open hidden pages.
    if (!APP_PAGES.includes(currentPage) || !navVisibility[currentPage]) {
        currentPage = "home";
        try { saveCurrentPage(); }
        catch (error) { console.warn("Could not remember Home page.", error); }
    }
    renderNavigationTabs();
}

function navigateToPage(page) {
    if (!APP_PAGES.includes(page)) return;
    activeChannelId = null;
    activeChannelVideoFilter = "all";
    librarySelectMode = false;
    librarySelectedIds.clear();
    currentPage = page;
    try { saveCurrentPage(); }
    catch (error) { console.warn("Could not save current page.", error); }
    updateNavigation();
    updateContent();
    window.scrollTo(0, 0);
}

function setupNavigation() {
    const navigation = document.querySelector(".bottom-navigation");
    if (!navigation || navigation.dataset.navigationReady === "true") return;
    navigation.dataset.navigationReady = "true";
    navigation.addEventListener("click", event => {
        const button = event.target.closest("button[data-app-page]");
        if (button && navigation.contains(button)) navigateToPage(button.dataset.appPage);
    });
}

function updateNavigation() {
    document.querySelectorAll(".bottom-navigation .nav-button").forEach(button => {
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


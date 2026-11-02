/* My YouTube PWA 1.3.2 — pure YouTube / display utilities.
   Load as a classic script before app.js so existing function names remain available.
   No storage, network, application state, or DOM dependencies.
   Functions copied without behavioural changes from PWA 1.3.1. */
'use strict';

function durationSecondsForSorting(value) {
    const text = String(value || "").trim();
    const hours = /(?:^|\s)(\d+)h(?:\s|$)/.exec(text);
    const minutes = /(?:^|\s)(\d+)m(?:\s|$)/.exec(text);
    const seconds = /(?:^|\s)(\d+)s(?:\s|$)/.exec(text);
    if (!hours && !minutes && !seconds) return null;
    return Number(hours?.[1] || 0) * 3600 +
        Number(minutes?.[1] || 0) * 60 + Number(seconds?.[1] || 0);
}

function parseYouTubeVideoId(text) {
    const raw = String(text || "").trim();
    if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
    try {
        const url = new URL(raw.startsWith("www.") || raw.startsWith("youtu.be/") ||
            raw.startsWith("youtube.com/") ? `https://${raw}` : raw);
        if (!/^(https?):$/.test(url.protocol)) return null;
        const host = url.hostname.toLowerCase();
        let id = null;
        if (host === "youtu.be" || host === "www.youtu.be") {
            id = url.pathname.split("/")[1];
        } else if (["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com",
            "youtube-nocookie.com", "www.youtube-nocookie.com"].includes(host)) {
            const parts = url.pathname.split("/").filter(Boolean);
            if (parts[0] === "watch") id = url.searchParams.get("v");
            else if (["shorts", "live", "embed", "v"].includes(parts[0])) id = parts[1];
        }
        return /^[A-Za-z0-9_-]{11}$/.test(id || "") ? id : null;
    } catch (error) { return null; }
}

function getYouTubeVideoLink(videoId) {
    // YouTube video IDs have 11 URL-safe characters. Use the canonical URL
    // rather than a URL from storage so links cannot point to other sites.
    const id = String(videoId ?? "").trim();
    return /^[A-Za-z0-9_-]{11}$/.test(id)
        ? `https://www.youtube.com/watch?v=${id}`
        : "";
}

function escapeHtml(text) {
    return String(text ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function parseYouTubeDurationSeconds(isoDuration) {
    // YouTube's contentDetails.duration is ISO 8601, not plain text.
    const match = String(isoDuration || "").match(
        /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/
    );
    if (!match || !match.slice(1).some(Boolean)) return null;
    return Number(match[1] || 0) * 86400 +
        Number(match[2] || 0) * 3600 +
        Number(match[3] || 0) * 60 +
        Number(match[4] || 0);
}

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

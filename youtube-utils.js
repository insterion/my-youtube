/* My YouTube PWA 1.3.2 — pure YouTube / display utilities.
   Load as a classic script before app.js so existing function names remain available.
   No storage, network, application state, or DOM dependencies.
   The channel parser is extended in 1.4.7 for @handles, channel URLs and video URLs. */
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

function parseYouTubeChannelUrl(input) {
    // Resolve channel URLs, a pasted @handle or a video URL. The latter is
    // looked up with videos.list before channels.list; no costly search.list.
    const invalid = { valid: false, type: null, value: null };
    let raw = String(input || "").trim();
    if (!raw || raw.length > 2048) return invalid;

    if (/^@[\p{L}\p{N}._\-\u00b7]{2,60}$/u.test(raw)) {
        return { valid: true, type: "handle", value: raw };
    }
    if (/^UC[A-Za-z0-9_-]{22}$/.test(raw)) {
        return { valid: true, type: "id", value: raw };
    }

    if (/^(?:www\.|m\.)?youtube\.com\//i.test(raw) || /^youtu\.be\//i.test(raw)) {
        raw = `https://${raw}`;
    }
    let url;
    try { url = new URL(raw); } catch (error) { return invalid; }
    if (!["https:", "http:"].includes(url.protocol) ||
        url.username || url.password || url.port) return invalid;
    const host = url.hostname.toLowerCase();
    const accepted = ["youtube.com", "www.youtube.com", "m.youtube.com",
        "music.youtube.com", "youtu.be", "www.youtu.be"];
    if (!accepted.includes(host)) return invalid;

    const videoId = parseYouTubeVideoId(url.href);
    if (videoId) return { valid: true, type: "video", value: videoId };
    if (host === "youtu.be" || host === "www.youtu.be") return invalid;

    const parts = url.pathname.split("/").filter(Boolean);
    if (!parts.length) return invalid;
    let first;
    try { first = decodeURIComponent(parts[0]); }
    catch (error) { return invalid; }
    // /@handle/videos, /channel/UC.../featured, /user/name/about are valid.
    if (/^@[\p{L}\p{N}._\-\u00b7]{2,60}$/u.test(first)) {
        return { valid: true, type: "handle", value: first };
    }
    if (first === "channel" && /^UC[A-Za-z0-9_-]{22}$/.test(parts[1] || "")) {
        return { valid: true, type: "id", value: parts[1] };
    }
    if (first === "user" && /^[A-Za-z0-9._-]{1,100}$/.test(parts[1] || "")) {
        return { valid: true, type: "username", value: parts[1] };
    }
    return invalid;
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

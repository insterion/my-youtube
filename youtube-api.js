/* My YouTube PWA 1.3.3 — YouTube API transport and local usage tracking.
   Extracted unchanged from app.js 1.3.2 for maintainability.
   Classic script loaded after youtube-utils.js and before app.js.
   Functions read API_USAGE_KEY/getApiKey from app.js at call time,
   after all scripts have loaded. No request is made on script load.
   Not an external service: requests still go directly to YouTube Data API. */
'use strict';

function pacificQuotaDay(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Los_Angeles",
        year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(date);
    const get = type => parts.find(part => part.type === type)?.value || "00";
    return `${get("year")}-${get("month")}-${get("day")}`;
}

function getLocalApiUsage() {
    const day = pacificQuotaDay();
    const initial = { day, searches: 0, other: 0 };
    try {
        const previous = JSON.parse(localStorage.getItem(API_USAGE_KEY) || "null");
        if (!previous || previous.day !== day) return initial;
        const valid = value => Number.isSafeInteger(value) && value >= 0;
        return {
            day,
            searches: valid(previous.searches) ? previous.searches : 0,
            other: valid(previous.other) ? previous.other : 0
        };
    } catch (error) {
        return initial;
    }
}

function recordLocalApiCall(endpoint) {
    const count = getLocalApiUsage();
    if (endpoint === "search") count.searches += 1;
    else count.other += 1;
    try {
        localStorage.setItem(API_USAGE_KEY, JSON.stringify(count));
    } catch (error) {
        // Failed local tracking must never interrupt YouTube requests.
        console.log("Could not save local API usage.", error);
    }
}


async function youtubeApiRequest(endpoint, parameters) {
    const apiKey = getApiKey();

    if (!apiKey) {
        throw new Error("NO_API_KEY");
    }

    const url = new URL(
        `https://www.googleapis.com/youtube/v3/${endpoint}`
    );

    Object.entries(parameters).forEach(([key, value]) => {
        url.searchParams.set(key, value);
    });

    // Keep the existing working API-key method for now.
    // The key itself is protected by Google Cloud restrictions.
    url.searchParams.set("key", apiKey);

    // Count the actual outgoing request, including each pagination request.
    // Even unsuccessful/invalid YouTube API requests can use quota.
    recordLocalApiCall(endpoint);
    // Avoid hanging indefinitely on a slow/mobile connection.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    let response;
    try {
        response = await fetch(url.toString(), { signal: controller.signal });
    } finally {
        clearTimeout(timeout);
    }

    let data;

    try {
        data = await response.json();
    } catch (error) {
        throw new Error("INVALID_API_RESPONSE");
    }

    if (!response.ok) {
        const reason =
            data?.error?.errors?.[0]?.reason ||
            data?.error?.message ||
            "UNKNOWN_API_ERROR";

        throw new Error(reason);
    }

    return data;
}


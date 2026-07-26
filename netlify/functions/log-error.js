// functions/log-error.js
console.log("log-error.js: Loading modules.");
const admin = require("firebase-admin");

const ALLOWED_ORIGIN = process.env.CONTEXT === 'dev' ? '*' : "https://erinslist.netlify.app";
const MAX_BODY_BYTES = 20000; // Guards against abuse/huge payloads before we even parse JSON
const MAX_BREADCRUMBS = 10;

let firebaseReady = false;
if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                // Netlify env vars can't store literal newlines, so private keys are stored with \n escapes.
                privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n")
            })
        });
        firebaseReady = true;
    } catch (initError) {
        console.error("log-error.js: Failed to initialize Firebase Admin:", initError);
    }
} else {
    firebaseReady = true;
}

function truncate(value, max) {
    if (typeof value !== "string") return null;
    return value.length > max ? value.slice(0, max) + "...[truncated]" : value;
}

exports.handler = async (event) => {
    const headers = {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed. Please use POST.' }) };
    }

    // Logging failures must never surface as user-facing errors, so everything
    // below returns 200 even when the log itself couldn't be stored.
    if (!firebaseReady) {
        console.error("log-error.js: Firebase Admin not initialized; dropping error log.");
        return { statusCode: 200, headers, body: JSON.stringify({ stored: false }) };
    }
    if (!event.body || event.body.length > MAX_BODY_BYTES) {
        return { statusCode: 200, headers, body: JSON.stringify({ stored: false, reason: "invalid or oversized body" }) };
    }

    let payload;
    try {
        payload = JSON.parse(event.body);
    } catch {
        return { statusCode: 200, headers, body: JSON.stringify({ stored: false, reason: "body was not valid JSON" }) };
    }

    const { message, stack, level, context } = payload || {};
    if (!message || typeof message !== 'string') {
        return { statusCode: 200, headers, body: JSON.stringify({ stored: false, reason: "'message' is required" }) };
    }

    const viewport = context && typeof context.viewport === 'object' && context.viewport
        ? { width: Number(context.viewport.width) || null, height: Number(context.viewport.height) || null }
        : null;

    const doc = {
        message: truncate(message, 2000),
        stack: truncate(stack, 4000),
        level: truncate(level, 50) || "error",
        context: {
            url: truncate(context && context.url, 500),
            userAgent: truncate(context && context.userAgent, 500),
            viewport,
            currentView: truncate(context && context.currentView, 100),
            userId: truncate(context && context.userId, 200),
            isLocalMode: !!(context && context.isLocalMode),
            breadcrumbs: Array.isArray(context && context.breadcrumbs)
                ? context.breadcrumbs.slice(-MAX_BREADCRUMBS).map(b => truncate(String(b), 500))
                : []
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    try {
        await admin.firestore().collection("errorLogs").add(doc);
    } catch (writeError) {
        console.error("log-error.js: Failed to write error log to Firestore:", writeError);
        return { statusCode: 200, headers, body: JSON.stringify({ stored: false }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ stored: true }) };
};

// functions/update-error-log.js
console.log("update-error-log.js: Loading modules.");
const admin = require("firebase-admin");

const ALLOWED_ORIGIN = process.env.CONTEXT === 'dev' ? '*' : "https://erinslist.netlify.app";
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);

let firebaseReady = false;
if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n")
            })
        });
        firebaseReady = true;
    } catch (initError) {
        console.error("update-error-log.js: Failed to initialize Firebase Admin:", initError);
    }
} else {
    firebaseReady = true;
}

exports.handler = async (event) => {
    const headers = {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed. Please use POST.' }) };
    }
    if (!firebaseReady) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server configuration error.' }) };
    }
    if (ADMIN_EMAILS.length === 0) {
        console.error("update-error-log.js: ADMIN_EMAILS is not configured.");
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Admin access is not configured.' }) };
    }

    const authHeader = event.headers.authorization || event.headers.Authorization || "";
    const match = authHeader.match(/^Bearer (.+)$/);
    if (!match) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Missing bearer token.' }) };
    }

    let decodedToken;
    try {
        decodedToken = await admin.auth().verifyIdToken(match[1]);
    } catch (verifyError) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid or expired token.' }) };
    }

    const callerEmail = (decodedToken.email || "").toLowerCase();
    if (!callerEmail || !ADMIN_EMAILS.includes(callerEmail)) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'You do not have permission to update error logs.' }) };
    }

    let payload;
    try {
        payload = JSON.parse(event.body || "{}");
    } catch {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Body must be valid JSON.' }) };
    }

    const { id, handled } = payload;
    if (!id || typeof id !== 'string') {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "'id' is required." }) };
    }

    try {
        await admin.firestore().collection("errorLogs").doc(id).update({
            handled: !!handled,
            handledAt: handled ? admin.firestore.FieldValue.serverTimestamp() : null,
            handledBy: handled ? callerEmail : null
        });
    } catch (updateError) {
        console.error("update-error-log.js: Failed to update Firestore doc:", updateError);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to update error log.' }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
};

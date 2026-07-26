// functions/get-error-logs.js
console.log("get-error-logs.js: Loading modules.");
const admin = require("firebase-admin");

const ALLOWED_ORIGIN = process.env.CONTEXT === 'dev' ? '*' : "https://erinslist.netlify.app";
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 100;

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
        console.error("get-error-logs.js: Failed to initialize Firebase Admin:", initError);
    }
} else {
    firebaseReady = true;
}

exports.handler = async (event) => {
    const headers = {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Content-Type": "application/json"
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed. Please use GET.' }) };
    }
    if (!firebaseReady) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server configuration error.' }) };
    }
    if (ADMIN_EMAILS.length === 0) {
        console.error("get-error-logs.js: ADMIN_EMAILS is not configured.");
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
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'You do not have permission to view error logs.' }) };
    }

    const requestedLimit = parseInt((event.queryStringParameters || {}).limit, 10);
    const limit = Math.min(Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : DEFAULT_LIMIT, MAX_LIMIT);

    try {
        const snapshot = await admin.firestore()
            .collection("errorLogs")
            .orderBy("createdAt", "desc")
            .limit(limit)
            .get();

        const logs = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                message: data.message || null,
                stack: data.stack || null,
                level: data.level || null,
                context: data.context || null,
                handled: !!data.handled,
                handledBy: data.handledBy || null,
                handledAt: (data.handledAt && typeof data.handledAt.toDate === 'function')
                    ? data.handledAt.toDate().toISOString()
                    : null,
                createdAt: (data.createdAt && typeof data.createdAt.toDate === 'function')
                    ? data.createdAt.toDate().toISOString()
                    : null
            };
        });

        return { statusCode: 200, headers, body: JSON.stringify({ logs }) };
    } catch (queryError) {
        console.error("get-error-logs.js: Failed to query Firestore:", queryError);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to fetch error logs.' }) };
    }
};

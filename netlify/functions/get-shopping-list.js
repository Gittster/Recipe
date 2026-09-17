// functions/get-shopping-list.js
// Read-only shopping list feed for the SweetSuite dashboard. Not used by the recipe app itself.
console.log("get-shopping-list.js: Loading modules.");
const admin = require("firebase-admin");

const ALLOWED_ORIGIN = process.env.CONTEXT === 'dev' ? '*' : "https://gittster.github.io";
const SWEETSUITE_API_KEY = process.env.SWEETSUITE_API_KEY;
const HOUSEHOLD_EMAIL = process.env.HOUSEHOLD_EMAIL;

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
        console.error("get-shopping-list.js: Failed to initialize Firebase Admin:", initError);
    }
} else {
    firebaseReady = true;
}

const uidCache = new Map();
async function resolveUid(email) {
    if (uidCache.has(email)) return uidCache.get(email);
    const user = await admin.auth().getUserByEmail(email);
    uidCache.set(email, user.uid);
    return user.uid;
}

exports.handler = async (event) => {
    const headers = {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Headers": "Content-Type, X-SweetSuite-Key, X-Household-Email",
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
    if (!SWEETSUITE_API_KEY) {
        console.error("get-shopping-list.js: SWEETSUITE_API_KEY is not configured.");
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'SweetSuite access is not configured.' }) };
    }

    const providedKey = event.headers['x-sweetsuite-key'] || event.headers['X-SweetSuite-Key'] || '';
    if (providedKey !== SWEETSUITE_API_KEY) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Missing or invalid API key.' }) };
    }

    const targetEmail = event.headers['x-household-email'] || event.headers['X-Household-Email'] || HOUSEHOLD_EMAIL;
    if (!targetEmail) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'No household email provided or configured.' }) };
    }

    try {
        const uid = await resolveUid(targetEmail);
        const doc = await admin.firestore().collection('shopping').doc(uid).get();
        const ingredients = doc.exists ? (doc.data().ingredients || []) : [];

        return { statusCode: 200, headers, body: JSON.stringify({ ingredients }) };
    } catch (queryError) {
        console.error("get-shopping-list.js: Failed to fetch shopping list:", queryError);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to fetch shopping list.' }) };
    }
};

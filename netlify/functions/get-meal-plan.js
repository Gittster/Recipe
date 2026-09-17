// functions/get-meal-plan.js
// Read-only meal plan feed for the SweetSuite dashboard. Not used by the recipe app itself.
console.log("get-meal-plan.js: Loading modules.");
const admin = require("firebase-admin");

const ALLOWED_ORIGIN = process.env.CONTEXT === 'dev' ? '*' : "https://gittster.github.io";
const SWEETSUITE_API_KEY = process.env.SWEETSUITE_API_KEY;
const HOUSEHOLD_EMAIL = process.env.HOUSEHOLD_EMAIL;
const DEFAULT_RANGE_DAYS = 14;

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
        console.error("get-meal-plan.js: Failed to initialize Firebase Admin:", initError);
    }
} else {
    firebaseReady = true;
}

// Netlify function containers are reused across warm invocations, so this
// avoids re-resolving the same email -> uid lookup on every request. Keyed
// by email since SweetSuite can now request on behalf of whichever household
// member is signed in, not just a single fixed account.
const uidCache = new Map();
async function resolveUid(email) {
    if (uidCache.has(email)) return uidCache.get(email);
    const user = await admin.auth().getUserByEmail(email);
    uidCache.set(email, user.uid);
    return user.uid;
}

function isoDate(date) {
    return date.toISOString().slice(0, 10);
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
        console.error("get-meal-plan.js: SWEETSUITE_API_KEY is not configured.");
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'SweetSuite access is not configured.' }) };
    }

    const providedKey = event.headers['x-sweetsuite-key'] || event.headers['X-SweetSuite-Key'] || '';
    if (providedKey !== SWEETSUITE_API_KEY) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Missing or invalid API key.' }) };
    }

    // SweetSuite forwards whichever household member is currently signed in;
    // HOUSEHOLD_EMAIL remains as a fallback for callers that don't send it.
    const targetEmail = event.headers['x-household-email'] || event.headers['X-Household-Email'] || HOUSEHOLD_EMAIL;
    if (!targetEmail) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'No household email provided or configured.' }) };
    }

    const params = event.queryStringParameters || {};
    const today = new Date();
    const start = params.start || isoDate(today);
    const end = params.end || isoDate(new Date(today.getTime() + DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000));

    try {
        const uid = await resolveUid(targetEmail);
        const snapshot = await admin.firestore()
            .collection('planning')
            .where('uid', '==', uid)
            .where('date', '>=', start)
            .where('date', '<=', end)
            .get();

        const meals = snapshot.docs
            .map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    date: data.date || null,
                    recipeName: data.recipeName || null,
                    recipeId: data.recipeId || null
                };
            })
            .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

        return { statusCode: 200, headers, body: JSON.stringify({ meals }) };
    } catch (queryError) {
        console.error("get-meal-plan.js: Failed to query Firestore:", queryError);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to fetch meal plan.' }) };
    }
};

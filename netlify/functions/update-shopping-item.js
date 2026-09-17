// functions/update-shopping-item.js
// Write endpoint for the SweetSuite dashboard: toggles a single shopping list
// ingredient's checked status. Not used by the recipe app itself.
console.log("update-shopping-item.js: Loading modules.");
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
        console.error("update-shopping-item.js: Failed to initialize Firebase Admin:", initError);
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
    if (!SWEETSUITE_API_KEY) {
        console.error("update-shopping-item.js: SWEETSUITE_API_KEY is not configured.");
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

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body.' }) };
    }
    const index = Number(body.index);
    if (!Number.isInteger(index) || index < 0) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing or invalid "index".' }) };
    }
    if (typeof body.checked !== 'boolean') {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing or invalid "checked".' }) };
    }

    try {
        const uid = await resolveUid(targetEmail);
        const docRef = admin.firestore().collection('shopping').doc(uid);
        const doc = await docRef.get();
        const ingredients = doc.exists ? (doc.data().ingredients || []) : [];

        if (index >= ingredients.length) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Index out of range.' }) };
        }

        ingredients[index] = { ...ingredients[index], checked: body.checked };
        await docRef.set({ ingredients, uid, updatedAt: admin.firestore.FieldValue.serverTimestamp() });

        return { statusCode: 200, headers, body: JSON.stringify({ ingredients }) };
    } catch (updateError) {
        console.error("update-shopping-item.js: Failed to update shopping item:", updateError);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to update shopping item.' }) };
    }
};

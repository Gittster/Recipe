// functions/get-recipe.js
// Read-only single-recipe lookup for the SweetSuite dashboard's full-screen
// recipe view. Not used by the recipe app itself.
console.log("get-recipe.js: Loading modules.");
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
        console.error("get-recipe.js: Failed to initialize Firebase Admin:", initError);
    }
} else {
    firebaseReady = true;
}

let cachedHouseholdUid = null;
async function getHouseholdUid() {
    if (cachedHouseholdUid) return cachedHouseholdUid;
    const user = await admin.auth().getUserByEmail(HOUSEHOLD_EMAIL);
    cachedHouseholdUid = user.uid;
    return cachedHouseholdUid;
}

exports.handler = async (event) => {
    const headers = {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Headers": "Content-Type, X-SweetSuite-Key",
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
    if (!SWEETSUITE_API_KEY || !HOUSEHOLD_EMAIL) {
        console.error("get-recipe.js: SWEETSUITE_API_KEY or HOUSEHOLD_EMAIL is not configured.");
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'SweetSuite access is not configured.' }) };
    }

    const providedKey = event.headers['x-sweetsuite-key'] || event.headers['X-SweetSuite-Key'] || '';
    if (providedKey !== SWEETSUITE_API_KEY) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Missing or invalid API key.' }) };
    }

    const recipeId = (event.queryStringParameters || {}).id;
    if (!recipeId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required "id" query parameter.' }) };
    }

    try {
        const uid = await getHouseholdUid();
        const doc = await admin.firestore().collection('recipes').doc(recipeId).get();

        if (!doc.exists || doc.data().uid !== uid) {
            return { statusCode: 404, headers, body: JSON.stringify({ error: 'Recipe not found.' }) };
        }

        const data = doc.data();
        const recipe = {
            id: doc.id,
            name: data.name || null,
            imageUrl: data.imageUrl || null,
            ingredients: data.ingredients || [],
            instructions: data.instructions || '',
            tags: data.tags || [],
            rating: data.rating || 0
        };

        return { statusCode: 200, headers, body: JSON.stringify({ recipe }) };
    } catch (queryError) {
        console.error("get-recipe.js: Failed to fetch recipe:", queryError);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to fetch recipe.' }) };
    }
};

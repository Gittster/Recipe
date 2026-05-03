const { GoogleGenerativeAI } = require("@google/generative-ai");

const RETRY_DELAYS = [1000, 2000, 4000];

async function callWithRetry(model, contents, config, attempt = 0) {
    try {
        return await model.generateContent({ contents, generationConfig: config });
    } catch (err) {
        if (attempt < RETRY_DELAYS.length && (err.status === 503 || err.status === 429)) {
            await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
            return callWithRetry(model, contents, config, attempt + 1);
        }
        throw err;
    }
}

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': process.env.CONTEXT === 'dev' ? '*' : 'https://erinslist.netlify.app',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json',
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

    let body;
    try { body = JSON.parse(event.body); }
    catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) }; }

    const { messages = [], context = {} } = body;
    const { recipes = [], madeHistory = [], dietaryRestrictions = [] } = context;

    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured' }) };

    // Compute upcoming Monday date for context
    const today = new Date();
    const dow = today.getDay();
    const daysToMon = dow === 0 ? 1 : dow === 1 ? 0 : 8 - dow;
    const monday = new Date(today);
    monday.setDate(today.getDate() + daysToMon);
    const weekLabel = monday.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

    // Build recipe frequency map from history
    const freq = {};
    madeHistory.forEach(h => { if (h.recipeName) freq[h.recipeName] = (freq[h.recipeName] || 0) + 1; });

    const recentNames = [...new Set(madeHistory.slice(0, 20).map(h => h.recipeName).filter(Boolean))].slice(0, 6);

    const recipeLines = recipes.slice(0, 60).map(r => {
        const f = freq[r.name] ? ` (made ${freq[r.name]}×)` : '';
        const stars = r.rating ? ` ★${r.rating}` : '';
        const tags = (r.tags || []).slice(0, 4).join(', ');
        return `• ${r.name}${stars}${f}${tags ? `  [${tags}]` : ''}  id:${r.id || ''}`;
    }).join('\n');

    const systemPrompt = `You are a warm, casual weekly meal planning assistant — like a helpful friend who knows the user's kitchen well.

WEEK: starting ${weekLabel}
DIETARY RESTRICTIONS: ${dietaryRestrictions.length ? dietaryRestrictions.join(', ') : 'none'}
RECENTLY MADE: ${recentNames.length ? recentNames.join(', ') : 'nothing recorded'}

USER'S RECIPES (${recipes.length} total):
${recipeLines || 'No recipes saved yet.'}

INSTRUCTIONS:
- Be conversational and warm, not robotic or listy
- Prefer recipes from their collection; suggest new ones only when nothing fits
- Avoid repeating recently made meals unless the user asks
- Keep suggestions practical (weeknights = quick; weekends = ok to be more involved)
- When you have enough info to propose a week, lay it out naturally in your message:
  e.g. "How does this sound — Monday I'm thinking the Chicken Parmesan since you've made it a few times and it's a weekday crowd-pleaser. Tuesday off since you said you're busy. Wednesday..."
- If the user wants to swap or adjust something, just update that day and confirm the rest
- Whenever your message contains a plan (full or partial), append a machine-readable block on its own line at the very end in EXACTLY this format (no markdown, no code fences):
  |||PLAN|||{"days":[{"day":"Monday","recipeName":"Chicken Parmesan","recipeId":"abc123","skip":false},{"day":"Tuesday","recipeName":null,"recipeId":null,"skip":true},{"day":"Wednesday","recipeName":"New Recipe Idea","recipeId":null,"skip":false},...all 7 days]}|||END|||
  Use the recipe's id from the list above as recipeId when it's an existing recipe, otherwise null.
  Set skip:true for days they won't cook.
- If you don't yet have enough info to propose a plan, omit the |||PLAN||| block entirely.

On the very first message (empty history), greet the user briefly and ask these three things in a friendly, single message:
1. Anything they know they want to make this week?
2. Any leftovers or ingredients they want to use up?
3. Any nights they won't be cooking?`;

    const contents = messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }],
    }));

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction: systemPrompt,
    });

    // Gemini requires at least one content turn — seed with a silent opener on first call
    const contentsToSend = contents.length > 0
        ? contents
        : [{ role: 'user', parts: [{ text: "Let's start." }] }];

    try {
        const result = await callWithRetry(model, contentsToSend, { temperature: 0.85, maxOutputTokens: 1024 });
        const raw = result.response.text().trim();

        // Extract plan JSON
        let plan = null;
        const planMatch = raw.match(/\|\|\|PLAN\|\|\|([\s\S]*?)\|\|\|END\|\|\|/);
        if (planMatch) {
            try { plan = JSON.parse(planMatch[1].trim()); } catch (e) { console.warn('Plan JSON parse failed:', e.message); }
        }

        // Strip the machine-readable block from the displayed message
        const message = raw.replace(/\|\|\|PLAN\|\|\|[\s\S]*?\|\|\|END\|\|\|/g, '').trim();

        return { statusCode: 200, headers, body: JSON.stringify({ message, plan }) };
    } catch (err) {
        console.error('Gemini error:', err);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'AI request failed: ' + err.message }) };
    }
};

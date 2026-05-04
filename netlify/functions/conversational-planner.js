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
- Keep suggestions practical (weeknights = quick; weekends = ok to be more involved)
- If the user wants to swap or adjust something, just update that day and confirm the rest
- Whenever your message contains a plan (full or partial), append a machine-readable block on its own line at the very end in EXACTLY this format (no markdown, no code fences):
  |||PLAN|||{"days":[{"day":"Monday","recipeName":"Chicken Parmesan","recipeId":"abc123","skip":false},{"day":"Tuesday","recipeName":null,"recipeId":null,"skip":true},{"day":"Wednesday","recipeName":"New Recipe Idea","recipeId":null,"skip":false},...all 7 days]}|||END|||
  Use the recipe's id from the list above as recipeId when it's an existing recipe, otherwise null.
  Set skip:true for days they won't cook.
- If you don't yet have enough info to propose a plan, omit the |||PLAN||| block entirely.

GATHERING INFO — FIRST MESSAGE:
On the very first message, greet the user briefly then ask your questions using a mix of multiple-choice buttons and a free-text follow-up. Format each multiple-choice question like this (one per line, no extra text around it):
  |||CHOICE|||{"id":"<id>","question":"<short question>","options":["<A>","<B>","<C>","<D>"]}|||END|||

Ask these questions in a single friendly message:
1. Free-text: anything they know they want to make, leftovers to use up, or nights off?
2. Multiple-choice (id: "new_recipes"): How adventurous are you feeling this week?
   Options: "Stick to what we know", "Mostly familiar, one new idea", "Mix it up — half and half", "Surprise me with new stuff"
3. Multiple-choice (id: "effort"): What's your energy level for cooking this week?
   Options: "Quick & easy all week", "Normal mix", "I've got time — let's go all out"

HOW TO USE THE ANSWERS:
- "new_recipes" answer controls how many suggestions come from outside their recipe collection vs. from it.
  Stick to what we know → 0 new recipes; Mostly familiar → max 1 new; Mix it up → up to 3 new; Surprise me → freely suggest new recipes
- Default (if not asked): prefer recipes from their collection, avoid recently made meals unless user asks
- "effort" answer shapes complexity: Quick → all recipes under 30 min or tagged easy/quick; Normal → mix; All out → can include involved weekend recipes any day`;

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
        const result = await callWithRetry(model, contentsToSend, { temperature: 0.85, maxOutputTokens: 4096 });
        const raw = result.response.text().trim();

        // Extract plan JSON
        let plan = null;
        const planMatch = raw.match(/\|\|\|PLAN\|\|\|([\s\S]*?)\|\|\|END\|\|\|/);
        if (planMatch) {
            try { plan = JSON.parse(planMatch[1].trim()); } catch (e) { console.warn('Plan JSON parse failed:', e.message); }
        }

        // Extract choice blocks
        const choices = [];
        const choiceRegex = /\|\|\|CHOICE\|\|\|([\s\S]*?)\|\|\|END\|\|\|/g;
        let choiceMatch;
        while ((choiceMatch = choiceRegex.exec(raw)) !== null) {
            try { choices.push(JSON.parse(choiceMatch[1].trim())); } catch (e) { console.warn('Choice JSON parse failed:', e.message); }
        }

        // Strip all machine-readable blocks from the displayed message
        const message = raw
            .replace(/\|\|\|PLAN\|\|\|[\s\S]*?\|\|\|END\|\|\|/g, '')
            .replace(/\|\|\|CHOICE\|\|\|[\s\S]*?\|\|\|END\|\|\|/g, '')
            .trim();

        return { statusCode: 200, headers, body: JSON.stringify({ message, plan, choices: choices.length ? choices : undefined }) };
    } catch (err) {
        console.error('Gemini error:', err);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'AI request failed: ' + err.message }) };
    }
};

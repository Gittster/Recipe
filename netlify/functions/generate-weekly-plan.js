// functions/generate-weekly-plan.js
console.log("generate-weekly-plan.js: Loading modules.");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const MODEL_NAME = "gemini-2.5-flash";
const API_KEY = process.env.GOOGLE_GEMINI_API_KEY;
console.log("generate-weekly-plan.js: API_KEY defined?", !!API_KEY);

const ALLOWED_ORIGIN = process.env.CONTEXT === 'dev' ? '*' : "https://erinslist.netlify.app";
console.log("generate-weekly-plan.js: Allowing origin:", ALLOWED_ORIGIN);

exports.handler = async (event) => {
    console.log("generate-weekly-plan.js: Handler started. Method:", event.httpMethod);

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
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }
    if (!API_KEY) {
        console.error("generate-weekly-plan.js: Missing API Key!");
        return { statusCode: 500, headers, body: JSON.stringify({ error: "Server configuration error: Missing API Key." }) };
    }

    let planStructure, existingRecipes, dietaryRestrictions;
    try {
        if (!event.body) throw new Error('Missing request body.');
        const body = JSON.parse(event.body);
        planStructure = body.planStructure;
        existingRecipes = body.existingRecipes || [];
        dietaryRestrictions = body.dietaryRestrictions || [];

        if (!planStructure || !Array.isArray(planStructure) || planStructure.length === 0) {
            throw new Error('"planStructure" is required and must be a non-empty array.');
        }
        if (!Array.isArray(dietaryRestrictions)) {
            throw new Error('"dietaryRestrictions" must be an array (can be empty).');
        }

        // Validate structure and sanitize per-day preferences
        const validModes = ['existing', 'new', 'mix'];
        planStructure.forEach(dayPlan => {
            if (dayPlan.suggestionMode && !validModes.includes(dayPlan.suggestionMode)) {
                throw new Error(`Invalid suggestionMode "${dayPlan.suggestionMode}" for ${dayPlan.day}. Must be 'existing', 'new', or 'mix'.`);
            }
            // Sanitize maxCookTime
            if (dayPlan.maxCookTime !== undefined && dayPlan.maxCookTime !== null) {
                const timeNum = parseInt(dayPlan.maxCookTime, 10);
                dayPlan.maxCookTime = (isNaN(timeNum) || timeNum <= 0) ? null : timeNum;
            } else {
                dayPlan.maxCookTime = null;
            }
            // Sanitize style
            if (dayPlan.style && typeof dayPlan.style === 'string' && dayPlan.style.trim()) {
                dayPlan.style = dayPlan.style.trim();
            } else {
                dayPlan.style = null;
            }
            // Sanitize ingredientsToUse
            if (dayPlan.ingredientsToUse && Array.isArray(dayPlan.ingredientsToUse)) {
                dayPlan.ingredientsToUse = dayPlan.ingredientsToUse
                    .filter(i => typeof i === 'string' && i.trim())
                    .map(i => i.trim().substring(0, 50))
                    .slice(0, 10);
            } else {
                dayPlan.ingredientsToUse = [];
            }
            // Sanitize mood
            const validMoods = ['comfort', 'healthy', 'adventurous'];
            dayPlan.mood = (dayPlan.mood && validMoods.includes(dayPlan.mood.toLowerCase()))
                ? dayPlan.mood.toLowerCase() : null;
            // Sanitize effort
            const validEfforts = ['minimal', 'worth-it', 'impress'];
            dayPlan.effort = (dayPlan.effort && validEfforts.includes(dayPlan.effort.toLowerCase()))
                ? dayPlan.effort.toLowerCase() : null;
        });

        console.log(`generate-weekly-plan.js: Received plan for ${planStructure.length} days.`);
        console.log(`generate-weekly-plan.js: Dietary Restrictions: ${dietaryRestrictions.join(', ') || 'None'}`);
        console.log(`generate-weekly-plan.js: ${existingRecipes.length} existing recipes provided.`);

    } catch (error) {
        console.error("generate-weekly-plan.js: Error parsing request:", error);
        return { statusCode: 400, headers, body: JSON.stringify({ error: `Bad Request: ${error.message}` }) };
    }

    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    // Build the prompt for 3 options per day
    let prompt = "You are Chef Bot, helping a user create a weekly meal plan.\n\n";

    if (dietaryRestrictions.length > 0) {
        prompt += `IMPORTANT: ALL suggestions MUST strictly adhere to these dietary restrictions: ${dietaryRestrictions.join(', ')}.\n\n`;
    }

    prompt += `Weekly Plan Structure:\n${JSON.stringify(planStructure, null, 2)}\n\n`;

    if (existingRecipes.length > 0) {
        const recipeList = existingRecipes.map(r => ({ id: r.id, name: r.name, tags: r.tags || [], rating: r.rating || 0 }));
        prompt += `User's Saved Recipes:\n${JSON.stringify(recipeList, null, 2)}\n\n`;
    } else {
        prompt += `User has no saved recipes.\n\n`;
    }

    prompt += `Your Task:
For each day that needs suggestions (type starts with 'cook-' AND recipeId is null), provide EXACTLY 3 options.

Suggestion Mode Rules:
- 'mix' (default): Provide 2 options from saved recipes (if available, prioritize higher rated) + 1 new idea. If fewer saved recipes match, fill with new ideas.
- 'existing': Provide 3 options from saved recipes only. If fewer than 3 match, return what's available.
- 'new': Provide 3 new recipe ideas (not from saved recipes).

Per-Day Preferences to Consider:
- maxCookTime: Suggest recipes that take less than this time
- style: Match the cuisine/cooking style
- ingredientsToUse: PRIORITIZE recipes using these ingredients
- mood: 'comfort'=hearty/warming, 'healthy'=light/nutritious, 'adventurous'=new cuisines
- effort: 'minimal'=quick/easy, 'worth-it'=moderate, 'impress'=elaborate

Output Format:
Return a JSON array. For each day:
- If recipeId is provided: { "day": "...", "type": "...", "recipeId": "..." }
- If type is 'leftovers': { "day": "...", "type": "leftovers" }
- If needs suggestions: { "day": "...", "type": "...", "options": [...] }

Each option in the "options" array should have:
- "source": "existing" or "new"
- "id": recipe ID (only for "existing" source)
- "name": recipe name

Example output:
[
  { "day": "Monday", "type": "cook-quick", "options": [
    { "source": "existing", "id": "abc123", "name": "Quick Garlic Pasta" },
    { "source": "existing", "id": "def456", "name": "15-Min Stir Fry" },
    { "source": "new", "name": "Speedy Lemon Chicken" }
  ]},
  { "day": "Tuesday", "type": "leftovers" },
  { "day": "Wednesday", "type": "cook-1day", "recipeId": "xyz789" }
]

Respond ONLY with valid JSON. No explanations.`;

    console.log("generate-weekly-plan.js: Sending prompt to Gemini.");

    try {
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
        });
        console.log("generate-weekly-plan.js: Received response from Gemini.");

        const responseText = result.response?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!responseText) {
            const errorMessage = "AI did not return a valid response.";
            console.error("generate-weekly-plan.js:", errorMessage);
            if (result.response?.promptFeedback?.blockReason) {
                console.error("-> Blocked Reason:", result.response.promptFeedback.blockReason);
            }
            return { statusCode: 500, headers, body: JSON.stringify({ error: errorMessage }) };
        }

        console.log("generate-weekly-plan.js: Raw response (first 300):", responseText.substring(0, 300));

        const planResult = JSON.parse(responseText);
        if (!Array.isArray(planResult)) {
            throw new Error("AI response was not a JSON array.");
        }

        // Clean and validate the result
        const cleanedResult = planResult.map(dayData => {
            const cleaned = {
                day: dayData.day,
                type: dayData.type
            };
            if (dayData.recipeId) {
                cleaned.recipeId = dayData.recipeId;
            }
            if (dayData.options && Array.isArray(dayData.options)) {
                cleaned.options = dayData.options.map(opt => ({
                    source: opt.source || 'new',
                    id: opt.id || null,
                    name: opt.name
                })).filter(opt => opt.name);
            }
            return cleaned;
        });

        console.log("generate-weekly-plan.js: Successfully parsed, returning 200.");
        return { statusCode: 200, headers, body: JSON.stringify(cleanedResult) };

    } catch (error) {
        console.error("generate-weekly-plan.js: Error:", error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: `Failed to generate plan: ${error.message}` }) };
    }
};

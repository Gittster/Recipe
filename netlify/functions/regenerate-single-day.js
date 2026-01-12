// functions/regenerate-single-day.js
const { GoogleGenerativeAI } = require("@google/generative-ai");

const MODEL_NAME = "gemini-2.5-flash";
const API_KEY = process.env.GOOGLE_GEMINI_API_KEY;
const ALLOWED_ORIGIN = process.env.CONTEXT === 'dev' ? '*' : "https://erinslist.netlify.app";

exports.handler = async (event) => {
    const headers = {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    if (!API_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: "Missing API Key" }) };

    let dayPlan, existingRecipes, dietaryRestrictions, excludeRecipes, refinementFeedback;
    try {
        const body = JSON.parse(event.body);
        dayPlan = body.dayPlan;
        existingRecipes = body.existingRecipes || [];
        dietaryRestrictions = body.dietaryRestrictions || [];
        excludeRecipes = body.excludeRecipes || [];
        refinementFeedback = body.refinementFeedback ? body.refinementFeedback.trim().substring(0, 200) : null;

        if (!dayPlan || !dayPlan.day || !dayPlan.type) throw new Error('dayPlan with day and type required');
    } catch (error) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: error.message }) };
    }

    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    let prompt = "You are Chef Bot. Regenerate 3 meal options for a single day.\n\n";

    if (dietaryRestrictions.length > 0) {
        prompt += `Dietary restrictions: ${dietaryRestrictions.join(', ')}\n`;
    }

    prompt += `Day: ${dayPlan.day}, Type: ${dayPlan.type}, Mode: ${dayPlan.suggestionMode || 'mix'}\n`;
    if (dayPlan.maxCookTime) prompt += `Max time: ${dayPlan.maxCookTime} min\n`;
    if (dayPlan.style) prompt += `Style: ${dayPlan.style}\n`;
    if (dayPlan.ingredientsToUse?.length) prompt += `Must use: ${dayPlan.ingredientsToUse.join(', ')}\n`;
    if (dayPlan.mood) prompt += `Mood: ${dayPlan.mood}\n`;
    if (dayPlan.effort) prompt += `Effort: ${dayPlan.effort}\n`;
    if (excludeRecipes.length) prompt += `Exclude these: ${excludeRecipes.join(', ')}\n`;
    if (refinementFeedback) prompt += `User feedback to incorporate: "${refinementFeedback}"\n`;

    const mode = dayPlan.suggestionMode || 'mix';

    if (mode === 'new') {
        prompt += '\nProvide 3 NEW recipe ideas (not from saved recipes).\n';
    } else if (mode === 'existing') {
        if (existingRecipes.length > 0) {
            const filtered = existingRecipes.filter(r => !excludeRecipes.includes(r.name));
            prompt += `\nSaved recipes: ${JSON.stringify(filtered.map(r => ({ id: r.id, name: r.name })))}\n`;
            prompt += 'Select 3 recipes from this list that best match the criteria.\n';
        } else {
            prompt += '\nNo saved recipes available. Return empty options.\n';
        }
    } else {
        // Mix mode
        if (existingRecipes.length > 0) {
            const filtered = existingRecipes.filter(r => !excludeRecipes.includes(r.name));
            prompt += `\nSaved recipes: ${JSON.stringify(filtered.map(r => ({ id: r.id, name: r.name })))}\n`;
            prompt += 'Provide 2 options from saved recipes + 1 new idea. If fewer saved recipes match, fill with new ideas.\n';
        } else {
            prompt += '\nNo saved recipes. Provide 3 new recipe ideas.\n';
        }
    }

    prompt += `
Output Format:
{
  "day": "${dayPlan.day}",
  "type": "${dayPlan.type}",
  "options": [
    { "source": "existing", "id": "recipe-id", "name": "Recipe Name" },
    { "source": "new", "name": "New Idea Name" }
  ]
}

Respond ONLY with valid JSON. No explanations.`;

    try {
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
        });

        const text = result.response?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error('No response from AI');

        const parsed = JSON.parse(text);

        // Clean and validate the options
        const options = (parsed.options || []).map(opt => ({
            source: opt.source || 'new',
            id: opt.id || null,
            name: opt.name
        })).filter(opt => opt.name);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                day: parsed.day || dayPlan.day,
                type: parsed.type || dayPlan.type,
                options
            })
        };
    } catch (error) {
        console.error("regenerate-single-day.js: Error:", error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }
};

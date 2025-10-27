// functions/generate-weekly-plan.js
console.log("generate-weekly-plan.js: Loading modules.");
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

const MODEL_NAME = "gemini-1.5-flash"; // Or your preferred model
const API_KEY = process.env.GOOGLE_GEMINI_API_KEY;
console.log("generate-weekly-plan.js: API_KEY defined?", !!API_KEY);

const ALLOWED_ORIGIN = process.env.NETLIFY_URL || "https://erinslist.netlify.app"; // Use env variable or default

exports.handler = async (event) => {
    console.log("generate-weekly-plan.js: Handler started. Method:", event.httpMethod);

    const headers = {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: headers, body: '' };
    }
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers: headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }
    if (!API_KEY) {
        console.error("generate-weekly-plan.js: Missing API Key!");
        return { statusCode: 500, headers: headers, body: JSON.stringify({ error: "Server configuration error: Missing API Key." }) };
    }

    // ** MODIFIED Input Parsing **
    let planStructure, existingRecipes;
    try {
        if (!event.body) throw new Error('Missing request body.');
        const body = JSON.parse(event.body);
        planStructure = body.planStructure;
        existingRecipes = body.existingRecipes || [];
        // Removed global preferences parsing

        if (!planStructure || !Array.isArray(planStructure) || planStructure.length === 0) {
            throw new Error('"planStructure" is required and must be a non-empty array.');
        }
        // Validate suggestionMode and optional preferences within the structure
        planStructure.forEach(dayPlan => {
            if (dayPlan.suggestionMode && dayPlan.suggestionMode !== 'existing' && dayPlan.suggestionMode !== 'new') {
                 throw new Error(`Invalid suggestionMode "${dayPlan.suggestionMode}" found for ${dayPlan.day}. Must be 'existing' or 'new'.`);
            }
            if (dayPlan.maxCookTime && (typeof dayPlan.maxCookTime !== 'number' || dayPlan.maxCookTime <= 0)) {
                 // Allow null or positive numbers
                 console.warn(`Invalid maxCookTime "${dayPlan.maxCookTime}" for ${dayPlan.day}. Ignoring.`);
                 dayPlan.maxCookTime = null; // Sanitize invalid value
            }
             if (dayPlan.style && typeof dayPlan.style !== 'string') {
                 console.warn(`Invalid style "${dayPlan.style}" for ${dayPlan.day}. Ignoring.`);
                 dayPlan.style = null; // Sanitize invalid value
            }
        });

        console.log(`generate-weekly-plan.js: Received plan structure for ${planStructure.length} days.`);
        // console.log(`generate-weekly-plan.js: Preferences - Time: ${preferences.maxCookTime}, Style: ${preferences.style}`); // Removed log
        console.log(`generate-weekly-plan.js: Received ${existingRecipes.length} existing recipes for context.`);

    } catch (error) {
        console.error("generate-weekly-plan.js: Error parsing request body:", error);
        return { statusCode: 400, headers: headers, body: JSON.stringify({ error: `Bad Request: ${error.message}` }) };
    }

    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    // Determine if any day requires new ideas
    const needsNewIdeas = planStructure.some(dayPlan =>
        dayPlan.type?.startsWith('cook-') && !dayPlan.recipeId && dayPlan.suggestionMode === 'new'
    );
    console.log("generate-weekly-plan.js: Needs new ideas?", needsNewIdeas);

    // --- ** MODIFIED Prompt Construction ** ---
    let fullPrompt = "You are Chef Bot, helping a user create a weekly meal plan.\n\n";
    // Removed global preferences section

    fullPrompt += `User's Desired Weekly Structure (includes pre-selected recipes, suggestion modes, and specific preferences for days needing suggestions):\n${JSON.stringify(planStructure, null, 2)}\n\n`;

    if (existingRecipes.length > 0) {
        fullPrompt += `User's Saved Recipes (for 'existing' mode suggestions - format: {id, name, tags, rating}):\n${JSON.stringify(existingRecipes, null, 2)}\n\n`;
    } else {
         fullPrompt += `User has no saved recipes provided (only 'new' mode suggestions are possible if requested).\n\n`;
    }

    fullPrompt += "Your Task:\n";
    fullPrompt += "Analyze the 'planStructure'. For each day:\n";
    fullPrompt += "- If 'recipeId' is already provided, keep that recipe (no 'recipe' object or 'ideas' needed in output for this day).\n";
    fullPrompt += "- If 'type' is 'leftovers' or 'none', no recipe/idea is needed.\n";
    fullPrompt += "- If 'type' starts with 'cook-' AND 'recipeId' is null:\n";
    fullPrompt += "  - Look at the 'suggestionMode', 'maxCookTime', and 'style' specified FOR THAT DAY in the input structure.\n"; // Emphasize per-day

    if (needsNewIdeas) { // Prompt asking for IDEAS for 'new' days, and EXISTING for 'existing' days
        fullPrompt += "    - If 'suggestionMode' is 'new': Suggest 2-3 concise, distinct recipe IDEAS fitting the day's 'type', 'maxCookTime', and 'style'. Add these as an 'ideas' array (strings).\n";
        fullPrompt += "    - If 'suggestionMode' is 'existing' (or default): Select ONE suitable recipe from the 'existingRecipes' list fitting the day's 'type', 'maxCookTime', and 'style' (consider variety, rating). Add this as a 'recipe' object containing ONLY 'id' and 'name'. If none fit, set 'recipe' to null.\n";
        fullPrompt += "\nOutput Format: Respond ONLY with a single valid JSON array, including the original 'day', 'type', 'recipeId' (if provided), and adding either the 'recipe' object (for existing suggestions) or the 'ideas' array (for new suggestions) where applicable. Omit suggestionMode, maxCookTime, and style from the output.\n";
        // Output examples remain the same as they didn't include the preferences
        fullPrompt += `Example element for 'new' suggestion:\n{ "day": "Monday", "type": "cook-quick", "ideas": ["Speedy Tacos", "15-Min Pasta"] }\n`;
        fullPrompt += `Example element for 'existing' suggestion:\n{ "day": "Tuesday", "type": "cook-1day", "recipe": { "id": "xyz789", "name": "Classic Baked Ziti" } }\n`;
         fullPrompt += `Example element for pre-selected:\n{ "day": "Wednesday", "type": "cook-1day", "recipeId": "abc123" }\n`; // Backend only includes ID

    } else { // Prompt asking ONLY for EXISTING recipes
        fullPrompt += "    - Select ONE suitable recipe from the 'existingRecipes' list fitting the day's 'type', 'maxCookTime', and 'style' (consider variety, rating). Add this as a 'recipe' object containing ONLY 'id' and 'name'. If none fit, set 'recipe' to null.\n";
        fullPrompt += "\nOutput Format: Respond ONLY with a single valid JSON array, including the original 'day', 'type', 'recipeId' (if provided), and adding the selected 'recipe' object (or null) where applicable. Omit suggestionMode, maxCookTime, and style from the output.\n";
        // Output examples remain the same
        fullPrompt += `Example element:\n{ "day": "Monday", "type": "cook-quick", "recipe": { "id": "recipeId123", "name": "Quick Lemon Pasta" } }\n`;
        fullPrompt += `Example element if no match found:\n{ "day": "Tuesday", "type": "cook-1day", "recipe": null }\n`;
        fullPrompt += `Example element for pre-selected:\n{ "day": "Wednesday", "type": "cook-1day", "recipeId": "abc123" }\n`;
    }

    fullPrompt += "\nEnsure the entire output is a single, valid JSON array. Do not include any other text, greetings, or explanations.";

    // Generation Config & Safety Settings (Unchanged)
    const generationConfig = {
        temperature: 0.7,
        topK: 1,
        topP: 1,
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
    };
    const safetySettings = [ /* ... HarmCategory settings ... */ ];


    console.log("generate-weekly-plan.js: Sending final prompt to Gemini.");
    // console.log("--- PROMPT START ---\n", fullPrompt, "\n--- PROMPT END ---"); // Uncomment for full prompt debugging

    try {
        const result = await model.generateContent({
             contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
             generationConfig,
             safetySettings,
        });
        console.log("generate-weekly-plan.js: Received response from Gemini.");

        // Check and parse JSON response (robust checks)
        if (result.response?.candidates?.[0]?.content?.parts?.[0]?.text) {
             const responseText = result.response.candidates[0].content.parts[0].text;
             console.log("generate-weekly-plan.js: Raw JSON response (first 200):", responseText.substring(0, 200));
            try {
                const planResult = JSON.parse(responseText);
                if (!Array.isArray(planResult)) throw new Error("AI response was not a JSON array.");
                
                // **Post-processing**: Clean up output - ensure only day, type, recipeId/recipe/ideas are present
                 const cleanedPlanResult = planResult.map(dayData => ({
                     day: dayData.day,
                     type: dayData.type,
                     recipeId: dayData.recipeId, // Keep if user provided it
                     recipe: dayData.recipe, // Keep if AI provided it
                     ideas: dayData.ideas // Keep if AI provided them
                 }));

                console.log("generate-weekly-plan.js: Successfully parsed & cleaned JSON array, returning 200.");
                return { statusCode: 200, headers: headers, body: JSON.stringify(cleanedPlanResult) }; // Return cleaned result
            } catch (parseError) {
                 console.error("generate-weekly-plan.js: Error parsing AI JSON response:", parseError, "\nRaw Text:", responseText);
                 return { statusCode: 500, headers: headers, body: JSON.stringify({ error: "AI response was not valid JSON.", rawResponse: responseText }) };
            }
        } else {
             // Handle blocked/empty response
              const errorMessage = "AI did not return a valid response candidate with JSON content.";
             console.error("generate-weekly-plan.js:", errorMessage, result.response);
             if (result.response?.promptFeedback?.blockReason) console.error("-> Blocked Reason:", result.response.promptFeedback.blockReason);
             if (result.response?.candidates?.[0]?.finishReason) console.error("-> Finish Reason:", result.response.candidates[0].finishReason);
             return { statusCode: 500, headers: headers, body: JSON.stringify({ error: errorMessage, details: result.response }) };
         }
    } catch (error) { // Catch errors during the API call
        console.error("generate-weekly-plan.js: Error calling Gemini API:", error);
        return { statusCode: 500, headers: headers, body: JSON.stringify({ error: `Failed to generate plan suggestions: ${error.message}` }) };
    }
};
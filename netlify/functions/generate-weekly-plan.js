// functions/generate-weekly-plan.js
console.log("generate-weekly-plan.js: Loading modules.");
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

const MODEL_NAME = "gemini-2.0-flash"; // Or your preferred model
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

    let planStructure, existingRecipes, preferences;
    try {
        if (!event.body) throw new Error('Missing request body.');
        const body = JSON.parse(event.body);
        planStructure = body.planStructure;
        existingRecipes = body.existingRecipes || [];
        preferences = body.preferences || { maxCookTime: null, style: null }; // Default preferences

        if (!planStructure || !Array.isArray(planStructure) || planStructure.length === 0) {
            throw new Error('"planStructure" is required and must be a non-empty array.');
        }
        // Validate suggestionMode within the structure
        planStructure.forEach(dayPlan => {
            if (dayPlan.suggestionMode && dayPlan.suggestionMode !== 'existing' && dayPlan.suggestionMode !== 'new') {
                 throw new Error(`Invalid suggestionMode "${dayPlan.suggestionMode}" found for ${dayPlan.day}. Must be 'existing' or 'new'.`);
            }
        });

        console.log(`generate-weekly-plan.js: Received plan structure for ${planStructure.length} days.`);
        console.log(`generate-weekly-plan.js: Preferences - Time: ${preferences.maxCookTime}, Style: ${preferences.style}`);
        console.log(`generate-weekly-plan.js: Received ${existingRecipes.length} existing recipes for context.`);

    } catch (error) {
        console.error("generate-weekly-plan.js: Error parsing request body:", error);
        return { statusCode: 400, headers: headers, body: JSON.stringify({ error: `Bad Request: ${error.message}` }) };
    }

    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    // --- Determine if any day requires new ideas ---
    const needsNewIdeas = planStructure.some(dayPlan =>
        dayPlan.type?.startsWith('cook-') && !dayPlan.recipeId && dayPlan.suggestionMode === 'new'
    );
    console.log("generate-weekly-plan.js: Needs new ideas?", needsNewIdeas);

    // --- Construct Prompt ---
    let fullPrompt = "You are Chef Bot, helping a user create a weekly meal plan.\n\n";
    fullPrompt += `Global User Preferences:\n- Max Cooking Time: ${preferences.maxCookTime ? preferences.maxCookTime + ' minutes' : 'Not specified'}\n- Preferred Style: ${preferences.style || 'Any'}\n\n`;
    fullPrompt += `User's Desired Weekly Structure (including pre-selected recipes and suggestion modes for days needing help):\n${JSON.stringify(planStructure, null, 2)}\n\n`;

    if (existingRecipes.length > 0) {
        fullPrompt += `User's Saved Recipes (for 'existing' mode suggestions):\n${JSON.stringify(existingRecipes, null, 2)}\n\n`;
    } else {
         fullPrompt += `User has no saved recipes provided (only 'new' mode suggestions are possible if requested).\n\n`;
    }

    fullPrompt += "Your Task:\n";
    fullPrompt += "Analyze the 'planStructure'. For each day:\n";
    fullPrompt += "- If 'recipeId' is already provided, keep that recipe.\n";
    fullPrompt += "- If 'type' is 'leftovers' or 'none', no recipe/idea is needed.\n";
    fullPrompt += "- If 'type' starts with 'cook-' AND 'recipeId' is null:\n";
    fullPrompt += "  - Check the 'suggestionMode' for that day (default to 'existing' if missing):\n";

    if (needsNewIdeas) { // Prompt asking for IDEAS for 'new' days, and EXISTING for 'existing' days
        fullPrompt += "    - If 'suggestionMode' is 'new': Suggest 2-3 concise, distinct recipe IDEAS fitting the 'type' and global preferences. Add these as an 'ideas' array (strings).\n";
        fullPrompt += "    - If 'suggestionMode' is 'existing': Select ONE suitable recipe from the 'existingRecipes' list fitting the 'type' and global preferences (consider variety, rating). Add this as a 'recipe' object containing ONLY 'id' and 'name'. If none fit, set 'recipe' to null.\n";
        fullPrompt += "\nOutput Format: Respond ONLY with a single valid JSON array, including the original 'day', 'type', 'recipeId' (if provided), and adding either the 'recipe' object (for existing suggestions) or the 'ideas' array (for new suggestions) where applicable.\n";
        fullPrompt += `Example element for 'new' suggestion:\n{ "day": "Monday", "type": "cook-quick", "suggestionMode": "new", "ideas": ["Speedy Tacos", "15-Min Pasta"] }\n`;
        fullPrompt += `Example element for 'existing' suggestion:\n{ "day": "Tuesday", "type": "cook-1day", "suggestionMode": "existing", "recipe": { "id": "xyz789", "name": "Classic Baked Ziti" } }\n`;
        fullPrompt += `Example element for pre-selected:\n{ "day": "Wednesday", "type": "cook-1day", "recipeId": "abc123" }\n`; // Backend doesn't add name here

    } else { // Prompt asking ONLY for EXISTING recipes
        fullPrompt += "    - Select ONE suitable recipe from the 'existingRecipes' list fitting the 'type' and global preferences (consider variety, rating). Add this as a 'recipe' object containing ONLY 'id' and 'name'. If none fit, set 'recipe' to null.\n";
        fullPrompt += "\nOutput Format: Respond ONLY with a single valid JSON array, including the original 'day', 'type', 'recipeId' (if provided), and adding the selected 'recipe' object (or null) where applicable.\n";
        fullPrompt += `Example element:\n{ "day": "Monday", "type": "cook-quick", "recipe": { "id": "recipeId123", "name": "Quick Lemon Pasta" } }\n`;
        fullPrompt += `Example element if no match found:\n{ "day": "Tuesday", "type": "cook-1day", "recipe": null }\n`;
        fullPrompt += `Example element for pre-selected:\n{ "day": "Wednesday", "type": "cook-1day", "recipeId": "abc123" }\n`; // Backend doesn't add name here
    }

    fullPrompt += "\nEnsure the entire output is a single, valid JSON array. Do not include any other text, greetings, or explanations.";

    // Generation Config & Safety Settings
    const generationConfig = {
        temperature: 0.7, // Adjust as needed
        topK: 1,
        topP: 1,
        maxOutputTokens: 4096, // Increased slightly for potentially longer lists/prompts
        responseMimeType: "application/json", // Crucial!
    };
    const safetySettings = [
         { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
         { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
         { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
         { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ];

    console.log("generate-weekly-plan.js: Sending final prompt to Gemini.");
    // For debugging the full prompt if needed:
    // console.log("--- PROMPT START ---\n", fullPrompt, "\n--- PROMPT END ---"); 

    try {
        const result = await model.generateContent({
             contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
             generationConfig,
             safetySettings,
        });
        console.log("generate-weekly-plan.js: Received response from Gemini.");

        // Check and parse JSON response (using the robust checks from previous function)
        if (result.response?.candidates?.[0]?.content?.parts?.[0]?.text) {
             const responseText = result.response.candidates[0].content.parts[0].text;
             console.log("generate-weekly-plan.js: Raw JSON response (first 200):", responseText.substring(0, 200));
            try {
                const planResult = JSON.parse(responseText);
                if (!Array.isArray(planResult)) throw new Error("AI response was not a JSON array.");
                
                // **Post-processing**: Ensure pre-selected recipes have names added back if needed by frontend
                // (Though your frontend handles this by looking up the ID later, which is better)
                // planResult.forEach(dayPlan => {
                //     if (dayPlan.recipeId && !dayPlan.recipe) {
                //         const foundRecipe = existingRecipes.find(r => r.id === dayPlan.recipeId);
                //         if (foundRecipe) {
                //             dayPlan.recipe = { id: foundRecipe.id, name: foundRecipe.name };
                //         }
                //     }
                // });

                console.log("generate-weekly-plan.js: Successfully parsed JSON array, returning 200.");
                return { statusCode: 200, headers: headers, body: JSON.stringify(planResult) };
            } catch (parseError) {
                 console.error("generate-weekly-plan.js: Error parsing AI JSON response:", parseError, "\nRaw Text:", responseText);
                 return { statusCode: 500, headers: headers, body: JSON.stringify({ error: "AI response was not valid JSON.", rawResponse: responseText }) };
            }
        } else {
             // Handle blocked/empty response (similar to previous function)
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
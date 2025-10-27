// functions/generate-weekly-plan.js
console.log("generate-weekly-plan.js: Loading modules.");
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

const MODEL_NAME = "gemini-2.0-flash"; // Or your preferred model
const API_KEY = process.env.GOOGLE_GEMINI_API_KEY;
console.log("generate-weekly-plan.js: API_KEY defined?", !!API_KEY);

// Use Netlify's URL env variable if available, otherwise default
const ALLOWED_ORIGIN = process.env.URL || "https://erinslist.netlify.app"; 
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
        return { statusCode: 204, headers: headers, body: '' };
    }
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers: headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }
    if (!API_KEY) {
        console.error("generate-weekly-plan.js: Missing API Key!");
        return { statusCode: 500, headers: headers, body: JSON.stringify({ error: "Server configuration error: Missing API Key." }) };
    }

    // ** UPDATED Input Parsing **
    let planStructure, existingRecipes, dietaryRestrictions;
    try {
        if (!event.body) throw new Error('Missing request body.');
        const body = JSON.parse(event.body);
        planStructure = body.planStructure;
        existingRecipes = body.existingRecipes || [];
        dietaryRestrictions = body.dietaryRestrictions || []; // Get dietary restrictions

        if (!planStructure || !Array.isArray(planStructure) || planStructure.length === 0) {
            throw new Error('"planStructure" is required and must be a non-empty array.');
        }
        if (!Array.isArray(dietaryRestrictions)) {
            throw new Error('"dietaryRestrictions" must be an array (can be empty).');
        }

        // Validate structure and sanitize per-day preferences
        planStructure.forEach(dayPlan => {
            if (dayPlan.suggestionMode && dayPlan.suggestionMode !== 'existing' && dayPlan.suggestionMode !== 'new') {
                 throw new Error(`Invalid suggestionMode "${dayPlan.suggestionMode}" found for ${dayPlan.day}. Must be 'existing' or 'new'.`);
            }
            // Sanitize maxCookTime: allow null or positive integers
            if (dayPlan.maxCookTime !== undefined && dayPlan.maxCookTime !== null) {
                const timeNum = parseInt(dayPlan.maxCookTime, 10);
                if (isNaN(timeNum) || timeNum <= 0) {
                    console.warn(`Invalid maxCookTime "${dayPlan.maxCookTime}" for ${dayPlan.day}. Resetting to null.`);
                    dayPlan.maxCookTime = null; 
                } else {
                    dayPlan.maxCookTime = timeNum; // Ensure it's a number
                }
            } else {
                 dayPlan.maxCookTime = null; // Ensure it's null if undefined or explicitly null
            }
             // Sanitize style: allow null or non-empty strings
             if (dayPlan.style !== undefined && dayPlan.style !== null) {
                 if (typeof dayPlan.style !== 'string' || dayPlan.style.trim() === '') {
                     console.warn(`Invalid style "${dayPlan.style}" for ${dayPlan.day}. Resetting to null.`);
                     dayPlan.style = null;
                 } else {
                     dayPlan.style = dayPlan.style.trim(); // Ensure trimmed string
                 }
            } else {
                 dayPlan.style = null; // Ensure it's null if undefined or explicitly null
            }
        });

        console.log(`generate-weekly-plan.js: Received plan structure for ${planStructure.length} days.`);
        console.log(`generate-weekly-plan.js: Dietary Restrictions: ${dietaryRestrictions.join(', ') || 'None'}`);
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

    // --- ** UPDATED Prompt Construction ** ---
    let fullPrompt = "You are Chef Bot, helping a user create a weekly meal plan.\n\n";
    
    // Add Dietary Restrictions to the prompt
    if (dietaryRestrictions.length > 0) {
        fullPrompt += `IMPORTANT: All recipe suggestions MUST strictly adhere to the following user dietary restrictions: ${dietaryRestrictions.join(', ')}.\n\n`;
    } else {
        fullPrompt += "User has specified no dietary restrictions.\n\n";
    }

    fullPrompt += `User's Desired Weekly Structure (includes pre-selected recipes, suggestion modes, and PER-DAY preferences for days needing suggestions):\n${JSON.stringify(planStructure, null, 2)}\n\n`;

    if (existingRecipes.length > 0) {
        // Provide slightly more detail for existing recipes if available and relevant (e.g., tags might help AI)
        const relevantExistingRecipes = existingRecipes.map(r => ({id: r.id, name: r.name, tags: r.tags || [], rating: r.rating || 0}));
        fullPrompt += `User's Saved Recipes (for 'existing' mode suggestions):\n${JSON.stringify(relevantExistingRecipes, null, 2)}\n\n`;
    } else {
         fullPrompt += `User has no saved recipes provided (only 'new' mode suggestions are possible if requested).\n\n`;
    }

    fullPrompt += "Your Task:\n";
    fullPrompt += "Analyze the 'planStructure'. For each day:\n";
    fullPrompt += "- If 'recipeId' is already provided, keep that recipe (no 'recipe' object or 'ideas' needed in output for this day).\n";
    fullPrompt += "- If 'type' is 'leftovers' or 'none', no recipe/idea is needed.\n";
    fullPrompt += "- If 'type' starts with 'cook-' AND 'recipeId' is null:\n";
    fullPrompt += "  - Look at the 'suggestionMode', 'maxCookTime', and 'style' specified FOR THAT DAY in the input structure.\n"; 
    fullPrompt += "  - ALL suggestions (existing or new ideas) MUST adhere to the dietary restrictions mentioned above.\n"; // Reinforce dietary constraint

    if (needsNewIdeas) { // Prompt asking for IDEAS for 'new' days, and EXISTING for 'existing' days
        fullPrompt += "    - If 'suggestionMode' is 'new': Suggest 2-3 concise, distinct recipe IDEAS fitting the day's 'type', 'maxCookTime', and 'style'. Add these as an 'ideas' array (strings).\n";
        fullPrompt += "    - If 'suggestionMode' is 'existing' (or default): Select ONE suitable recipe from the 'existingRecipes' list fitting the day's 'type', 'maxCookTime', and 'style' (consider variety, rating). Add this as a 'recipe' object containing ONLY 'id' and 'name'. If none fit or available, set 'recipe' to null.\n";
        fullPrompt += "\nOutput Format: Respond ONLY with a single valid JSON array, including the original 'day', 'type', 'recipeId' (if provided), and adding either the 'recipe' object (for existing suggestions) or the 'ideas' array (for new suggestions) where applicable. Omit suggestionMode, maxCookTime, and style from the output.\n";
        // Output examples remain the same
        fullPrompt += `Example element for 'new' suggestion:\n{ "day": "Monday", "type": "cook-quick", "ideas": ["Speedy Vegan Tacos", "15-Min Gluten-Free Pasta"] }\n`; // Updated example
        fullPrompt += `Example element for 'existing' suggestion:\n{ "day": "Tuesday", "type": "cook-1day", "recipe": { "id": "xyz789", "name": "Classic Baked Ziti (Veg Option)" } }\n`; // Updated example
        fullPrompt += `Example element for pre-selected:\n{ "day": "Wednesday", "type": "cook-1day", "recipeId": "abc123" }\n`;

    } else { // Prompt asking ONLY for EXISTING recipes
        fullPrompt += "    - Select ONE suitable recipe from the 'existingRecipes' list fitting the day's 'type', 'maxCookTime', and 'style' (consider variety, rating). Add this as a 'recipe' object containing ONLY 'id' and 'name'. If none fit or available, set 'recipe' to null.\n";
        fullPrompt += "\nOutput Format: Respond ONLY with a single valid JSON array, including the original 'day', 'type', 'recipeId' (if provided), and adding the selected 'recipe' object (or null) where applicable. Omit suggestionMode, maxCookTime, and style from the output.\n";
        // Output examples remain the same
        fullPrompt += `Example element:\n{ "day": "Monday", "type": "cook-quick", "recipe": { "id": "recipeId123", "name": "Quick Lemon Pasta (Gluten-Free)" } }\n`; // Updated example
        fullPrompt += `Example element if no match found:\n{ "day": "Tuesday", "type": "cook-1day", "recipe": null }\n`;
        fullPrompt += `Example element for pre-selected:\n{ "day": "Wednesday", "type": "cook-1day", "recipeId": "abc123" }\n`;
    }

    fullPrompt += "\nEnsure the entire output is a single, valid JSON array adhering to the dietary restrictions. Do not include any other text, greetings, or explanations.";

    // Generation Config & Safety Settings (Unchanged)
    const generationConfig = { /* ... temperature, etc. ... */ responseMimeType: "application/json" };
    const safetySettings = [ /* ... HarmCategory settings ... */ ];


    console.log("generate-weekly-plan.js: Sending final prompt to Gemini.");
    // console.log("--- PROMPT START ---\n", fullPrompt, "\n--- PROMPT END ---"); 

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
                
                // Clean the result (remove internal-use fields)
                 const cleanedPlanResult = planResult.map(dayData => ({
                     day: dayData.day,
                     type: dayData.type,
                     recipeId: dayData.recipeId, // Keep if user provided it
                     recipe: dayData.recipe,     // Keep if AI provided it
                     ideas: dayData.ideas        // Keep if AI provided them
                 }));

                console.log("generate-weekly-plan.js: Successfully parsed & cleaned JSON array, returning 200.");
                return { statusCode: 200, headers: headers, body: JSON.stringify(cleanedPlanResult) };
            } catch (parseError) {
                 console.error("generate-weekly-plan.js: Error parsing AI JSON response:", parseError, "\nRaw Text:", responseText);
                 return { statusCode: 500, headers: headers, body: JSON.stringify({ error: "AI response was not valid JSON.", rawResponse: responseText }) };
            }
        } else {
             // Handle blocked/empty response
             // ... (same logic as before) ...
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
// functions/generate-weekly-plan.js
console.log("generate-weekly-plan.js: Loading modules.");
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

const MODEL_NAME = "gemini-2.0-flash"; // Using Flash for potentially faster responses
const API_KEY = process.env.GOOGLE_GEMINI_API_KEY;
console.log("generate-weekly-plan.js: API_KEY defined?", !!API_KEY);

const ALLOWED_ORIGIN = "https://erinslist.netlify.app"; // Or your development URL for testing

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

    let planStructure, suggestionMode, existingRecipes;
    try {
        if (!event.body) throw new Error('Missing request body.');
        const body = JSON.parse(event.body);
        planStructure = body.planStructure;
        suggestionMode = body.suggestionMode;
        existingRecipes = body.existingRecipes || []; // Optional

        if (!planStructure || !Array.isArray(planStructure) || planStructure.length === 0) {
            throw new Error('"planStructure" is required and must be a non-empty array.');
        }
        if (!suggestionMode || (suggestionMode !== 'existing' && suggestionMode !== 'new')) {
            throw new Error('"suggestionMode" must be either "existing" or "new".');
        }
        console.log(`generate-weekly-plan.js: Received mode '${suggestionMode}', ${planStructure.length} days.`);
    } catch (error) {
        console.error("generate-weekly-plan.js: Error parsing request body:", error);
        return { statusCode: 400, headers: headers, body: JSON.stringify({ error: `Bad Request: ${error.message}` }) };
    }

    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    // --- Construct Prompt based on Mode ---
    let fullPrompt = "";
    let expectedResponseType = "json"; // Assume JSON unless mode is 'new'

    if (suggestionMode === 'existing') {
        fullPrompt = `
You are Chef Bot, helping a user create a weekly meal plan by suggesting recipes they already have saved.

Here is the user's desired weekly structure:
${JSON.stringify(planStructure, null, 2)}

Here is a list of the user's saved recipes (id, name, tags, rating):
${JSON.stringify(existingRecipes, null, 2)}

Your task:
1.  Analyze the 'planStructure'.
2.  For each day where 'type' starts with 'cook-' AND 'recipeId' is null:
    - Select ONE suitable recipe from the 'existingRecipes' list.
    - Prioritize recipes matching the 'type' (e.g., 'cook-quick' should ideally get a recipe tagged 'quick').
    - Also consider variety (don't suggest very similar recipes on consecutive cook days) and rating (prefer higher rated).
    - If no suitable existing recipe is found for a 'cook-' day, set the recipe field to null for that day.
3.  For days where 'type' is 'leftovers', the 'recipe' field should be null or omitted.
4.  For days where 'recipeId' is already provided in the input, keep that recipe (return its id and name).
5.  Ensure 'leftovers' days logically follow a 'cook-leftovers' day if possible, but strictly adhere to the user's input structure otherwise.

Output ONLY a valid JSON array matching the input structure, but with the 'recipe' field populated for suggested days. The 'recipe' object should contain ONLY 'id' and 'name'. Example output format for one day:
{ "day": "Monday", "type": "cook-quick", "recipe": { "id": "recipeId123", "name": "Quick Lemon Pasta" } }
Or if no recipe was selected or applicable:
{ "day": "Tuesday", "type": "cook-1day", "recipe": null }
Or for leftovers:
{ "day": "Wednesday", "type": "leftovers" } 
Or if pre-selected:
{ "day": "Thursday", "type": "cook-1day", "recipe": { "id": "userSelectedId456", "name": "User's Choice Casserole" } }

Respond ONLY with the JSON array. Do not include any other text, greetings, or explanations.
        `;
    } else { // suggestionMode === 'new'
        fullPrompt = `
You are Chef Bot, helping a user brainstorm new recipe ideas for their weekly meal plan.

Here is the user's desired weekly structure:
${JSON.stringify(planStructure, null, 2)}

Your task:
1.  Analyze the 'planStructure'.
2.  For each day where 'type' starts with 'cook-' AND 'recipeId' is null:
    - Suggest 2-3 concise and distinct recipe IDEAS (just names or very short descriptions, like "Spicy Shrimp Tacos" or "Creamy Tomato Soup with Grilled Cheese").
    - The ideas should fit the requested 'type' (e.g., 'cook-quick' ideas should sound quick to make, 'cook-leftovers' ideas should sound like they yield leftovers).
3.  For days where 'type' is 'leftovers' or a 'recipeId' is already provided, do not suggest ideas.

Output ONLY a valid JSON array matching the input structure, adding an 'ideas' array (of strings) for days needing suggestions. Example output format:
[
  { "day": "Monday", "type": "cook-quick", "ideas": ["Speedy Chicken Stir-fry", "15-Minute Garlic Noodles"] },
  { "day": "Tuesday", "type": "cook-leftovers", "ideas": ["Large Batch Chili", "Sheet Pan Sausage and Veggies"] },
  { "day": "Wednesday", "type": "leftovers" },
  { "day": "Thursday", "type": "cook-1day", "recipeId": "userSelectedId456" },
  { "day": "Friday", "type": "cook-1day", "ideas": ["Pan-Seared Salmon with Asparagus", "Individual Pizzas"] }
]

Respond ONLY with the JSON array. Do not include any other text, greetings, or explanations.
        `;
    }
     // Shared generation config and safety settings (copy from your existing function)
     const generationConfig = { /* ... temperature, topK, etc. ... */ };
     const safetySettings = [ /* ... HarmCategory settings ... */];
     generationConfig.responseMimeType = "application/json"; // Request JSON directly!

    console.log("generate-weekly-plan.js: Sending prompt to Gemini.");
    try {
        // **MODIFIED to directly expect JSON**
        const result = await model.generateContent({
             contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
             generationConfig,
             safetySettings,
        });
        console.log("generate-weekly-plan.js: Received response from Gemini.");

        // Check if response exists and has JSON content directly
        if (result.response && 
            result.response.candidates && 
            result.response.candidates.length > 0 &&
            result.response.candidates[0].content &&
            result.response.candidates[0].content.parts &&
            result.response.candidates[0].content.parts.length > 0 &&
            result.response.candidates[0].content.parts[0].text // Gemini JSON mode returns text
           ) {
            
            const responseText = result.response.candidates[0].content.parts[0].text;
            console.log("generate-weekly-plan.js: Raw JSON response text (first 200):", responseText.substring(0, 200));

            try {
                const planResult = JSON.parse(responseText);
                if (!Array.isArray(planResult)) throw new Error("AI response was not a JSON array.");
                
                console.log("generate-weekly-plan.js: Successfully parsed JSON array, returning 200.");
                return { statusCode: 200, headers: headers, body: JSON.stringify(planResult) };
            } catch (parseError) {
                 console.error("generate-weekly-plan.js: Error parsing AI JSON response:", parseError, "\nRaw Text:", responseText);
                 return { statusCode: 500, headers: headers, body: JSON.stringify({ error: "AI response was not valid JSON.", rawResponse: responseText }) };
            }
        } else {
             const errorMessage = "AI did not return a valid response candidate with JSON content.";
             console.error("generate-weekly-plan.js:", errorMessage, result.response);
             // Log safety ratings if available
             if (result.response?.promptFeedback?.blockReason) {
                 console.error("-> Blocked Reason:", result.response.promptFeedback.blockReason);
             }
             if (result.response?.candidates?.[0]?.finishReason) {
                 console.error("-> Finish Reason:", result.response.candidates[0].finishReason);
             }
             return { statusCode: 500, headers: headers, body: JSON.stringify({ error: errorMessage, details: result.response }) };
         }

    } catch (error) { // Catch errors during the API call itself
        console.error("generate-weekly-plan.js: Error calling Gemini API:", error);
        return { statusCode: 500, headers: headers, body: JSON.stringify({ error: `Failed to generate plan: ${error.message}` }) };
    }
};
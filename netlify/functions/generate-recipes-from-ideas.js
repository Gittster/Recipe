// functions/generate-recipes-from-ideas.js
console.log("generate-recipes-from-ideas.js: Loading modules.");
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

const MODEL_NAME = "gemini-2.5-flash";
const API_KEY = process.env.GOOGLE_GEMINI_API_KEY;
console.log("generate-recipes-from-ideas.js: API_KEY defined?", !!API_KEY);

const ALLOWED_ORIGIN = "https://erinslist.netlify.app";

exports.handler = async (event) => {
    console.log("generate-recipes-from-ideas.js: Handler started. Method:", event.httpMethod);

    const headers = { /* ... Same headers as before ... */ };
    headers["Content-Type"] = "application/json"; // Ensure correct Content-Type

    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: headers, body: '' };
    if (event.httpMethod !== 'POST') return { statusCode: 405, headers: headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    if (!API_KEY) {
        console.error("generate-recipes-from-ideas.js: Missing API Key!");
        return { statusCode: 500, headers: headers, body: JSON.stringify({ error: "Server configuration error." }) };
    }

    let chosenIdeas;
    try {
        if (!event.body) throw new Error('Missing request body.');
        const body = JSON.parse(event.body);
        chosenIdeas = body.chosenIdeas;
        if (!chosenIdeas || !Array.isArray(chosenIdeas) || chosenIdeas.length === 0) {
            throw new Error('"chosenIdeas" is required and must be a non-empty array.');
        }
        console.log(`generate-recipes-from-ideas.js: Received ${chosenIdeas.length} chosen ideas.`);
    } catch (error) {
        console.error("generate-recipes-from-ideas.js: Error parsing request body:", error);
        return { statusCode: 400, headers: headers, body: JSON.stringify({ error: `Bad Request: ${error.message}` }) };
    }

    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    // --- Construct Prompt to Generate Multiple Recipes ---
    // Create a list of instructions for the AI
    const recipeRequests = chosenIdeas.map((idea, index) => 
        `Recipe ${index + 1} (${idea.day}, Type: ${idea.type}): Generate a full recipe for "${idea.chosenIdea}".`
    ).join("\n");

    const fullPrompt = `
You are Chef Bot. Generate full recipes based on the following user-selected ideas.

Requests:
${recipeRequests}

For EACH recipe, provide:
- A unique and appropriate name.
- A list of ingredients (each object with "name", "quantity", "unit"). Format quantity as string if needed (e.g., "1/2", "to taste").
- Step-by-step instructions.
- A few relevant tags (array of strings, e.g., ["dinner", "quick", "ai-generated"]).

Output ONLY a single valid JSON array where each element corresponds to one requested recipe. Each element MUST include the original "day" and "type" from the request, plus the generated "recipe" object containing "name", "ingredients", "instructions", and "tags".

Example output format for TWO requested recipes:
[
  { 
    "day": "Monday", 
    "type": "cook-quick", 
    "recipe": { 
      "name": "Speedy Chicken Stir-fry", 
      "ingredients": [ { "name": "Chicken Breast", "quantity": "1", "unit": "lb" }, ... ], 
      "instructions": "1. Chop chicken...", 
      "tags": ["quick", "chicken", "stir-fry", "ai-generated"] 
    } 
  },
  { 
    "day": "Tuesday", 
    "type": "cook-leftovers", 
    "recipe": { 
      "name": "Large Batch Chili", 
      "ingredients": [ { "name": "Ground Beef", "quantity": "2", "unit": "lbs" }, ... ], 
      "instructions": "1. Brown beef...", 
      "tags": ["chili", "leftovers", "beef", "ai-generated"] 
    } 
  }
]

Ensure the entire output is a single, valid JSON array. Do not include any other text, greetings, or explanations.
`;

     // Shared generation config and safety settings
     const generationConfig = { /* ... temperature, etc. ... */ };
     const safetySettings = [ /* ... HarmCategory settings ... */];
     generationConfig.responseMimeType = "application/json"; // Request JSON directly

    console.log("generate-recipes-from-ideas.js: Sending prompt to Gemini.");
    try {
         // **MODIFIED to directly expect JSON**
        const result = await model.generateContent({
             contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
             generationConfig,
             safetySettings,
        });
        console.log("generate-recipes-from-ideas.js: Received response from Gemini.");

        // Check and parse JSON response (similar logic to the previous function)
        if (result.response?.candidates?.[0]?.content?.parts?.[0]?.text) {
             const responseText = result.response.candidates[0].content.parts[0].text;
             console.log("generate-recipes-from-ideas.js: Raw JSON response (first 200):", responseText.substring(0, 200));
            try {
                const fullRecipesResult = JSON.parse(responseText);
                if (!Array.isArray(fullRecipesResult)) throw new Error("AI response was not a JSON array.");
                
                // **Basic Validation:** Check if the number of recipes matches roughly the number of ideas requested
                if (fullRecipesResult.length < chosenIdeas.length * 0.8) { // Allow for some potential AI misses
                     console.warn(`AI returned ${fullRecipesResult.length} recipes for ${chosenIdeas.length} ideas.`);
                     // Decide if this is an error or just a partial success
                }
                // Further validation could check if each object has day, type, recipe.name etc.
                
                console.log("generate-recipes-from-ideas.js: Successfully parsed JSON array, returning 200.");
                return { statusCode: 200, headers: headers, body: JSON.stringify(fullRecipesResult) };
            } catch (parseError) {
                 console.error("generate-recipes-from-ideas.js: Error parsing AI JSON response:", parseError, "\nRaw Text:", responseText);
                 return { statusCode: 500, headers: headers, body: JSON.stringify({ error: "AI response for full recipes was not valid JSON.", rawResponse: responseText }) };
            }
        } else {
             // Handle cases where AI response is blocked or empty (similar to previous function)
             const errorMessage = "AI did not return a valid response candidate with JSON content for full recipes.";
             console.error("generate-recipes-from-ideas.js:", errorMessage, result.response);
              // Log safety/finish reasons if available
             if (result.response?.promptFeedback?.blockReason) console.error("-> Blocked Reason:", result.response.promptFeedback.blockReason);
             if (result.response?.candidates?.[0]?.finishReason) console.error("-> Finish Reason:", result.response.candidates[0].finishReason);
             return { statusCode: 500, headers: headers, body: JSON.stringify({ error: errorMessage, details: result.response }) };
         }

    } catch (error) { // Catch errors during the API call
        console.error("generate-recipes-from-ideas.js: Error calling Gemini API:", error);
        return { statusCode: 500, headers: headers, body: JSON.stringify({ error: `Failed to generate full recipes: ${error.message}` }) };
    }
};

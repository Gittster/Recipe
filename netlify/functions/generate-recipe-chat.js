// functions/generate-recipe-chat.js
console.log("generate-recipe-chat.js: Top of file, loading modules.");

const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
console.log("generate-recipe-chat.js: GoogleGenerativeAI module loaded.");

const MODEL_NAME = "gemini-1.5-flash-latest"; // Ensure this model is suitable
const API_KEY = process.env.GOOGLE_GEMINI_API_KEY;
console.log("generate-recipe-chat.js: API_KEY defined?", !!API_KEY);

// Update with your actual deployed Netlify URL or use "*" for local dev if needed
const ALLOWED_ORIGIN = process.env.NETLIFY_URL || "https://your-app-name.netlify.app";
console.log("generate-recipe-chat.js: ALLOWED_ORIGIN defined as:", ALLOWED_ORIGIN);

exports.handler = async (event) => {
    console.log("generate-recipe-chat.js: Handler started. Event HTTP method:", event.httpMethod);

    const headers = {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    if (event.httpMethod === 'OPTIONS') {
        console.log("generate-recipe-chat.js: Handling OPTIONS request.");
        return { statusCode: 204, headers: headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        console.log("generate-recipe-chat.js: Incorrect HTTP method, returning 405.");
        return { statusCode: 405, headers: headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    if (!API_KEY) {
        console.error("generate-recipe-chat.js: Missing Google Gemini API Key!");
        return { statusCode: 500, headers: headers, body: JSON.stringify({ error: "Server configuration error: Missing API Key." }) };
    }

    let userPrompt;
    let conversationHistory = []; // To store received history

    try {
        console.log("generate-recipe-chat.js: Parsing request body.");
        if (!event.body) throw new Error("Request body is missing.");
        
        const body = JSON.parse(event.body);
        userPrompt = body.prompt; // This is the current request from the user
        if (body.history && Array.isArray(body.history)) {
            conversationHistory = body.history;
            console.log("generate-recipe-chat.js: Received conversation history length:", conversationHistory.length);
        }
        if (!userPrompt || typeof userPrompt !== 'string' || userPrompt.trim() === '') {
            throw new Error('Bad Request: "prompt" is required and must be a non-empty string.');
        }
        console.log("generate-recipe-chat.js: User prompt parsed (first 50 chars):", userPrompt.substring(0, 50) + "...");
    } catch (error) {
        console.error("generate-recipe-chat.js: Error parsing request body:", error);
        return { statusCode: 400, headers: headers, body: JSON.stringify({ error: `Bad Request: ${error.message}` }) };
    }

    console.log("generate-recipe-chat.js: Initializing Gemini AI.");
    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    // Construct history for the API call
    const apiHistory = conversationHistory.map(turn => ({
        role: turn.role, // 'user' or 'model'
        parts: [{ text: turn.text }]
    }));

    const currentPromptText = `
        You are "Chef Bot," a helpful recipe assistant.
        PREVIOUS CONVERSATION (if any, for context):
        ${apiHistory.map(h => `${h.role}: ${h.parts[0].text}`).join('\n')}

        CURRENT USER REQUEST: "${userPrompt}"

        Based on my current request and considering our previous conversation (if any), please generate a new recipe.
        If my current request is a refinement or a follow-up to a recipe you just suggested in the conversation history, please adjust accordingly.
        The recipe should include a name, a list of ingredients (each with name, quantity, and unit),
        step-by-step instructions, and 3-5 relevant tags (as an array of strings).
        All string values in the JSON must be properly escaped.
        For "quantity", provide values as JSON numbers (e.g., 1, 0.5, 200) or as strings (e.g., "1/2", "to taste").
        Do not use unquoted bare fractions like 1/2 as values for "quantity".

        Respond ONLY with a single valid JSON object in the following format:
        {
          "name": "Recipe Name",
          "ingredients": [ { "name": "Ingredient 1", "quantity": "1", "unit": "cup" } ],
          "instructions": "1. Step one.",
          "tags": ["tag1", "tag2", "relevant-tag"]
        }
        Ensure your entire output is strictly JSON, with no surrounding text or markdown.
    `;

    const contentsForApi = [...apiHistory, { role: "user", parts: [{ text: currentPromptText }] }];
    
    const generationConfig = { temperature: 0.7, topK: 1, topP: 1, maxOutputTokens: 3000 }; // Increased tokens for full recipe
    const safetySettings = [ /* ... your existing safety settings ... */ ];


    console.log("generate-recipe-chat.js: Attempting to generate content with Gemini.");
    try {
        const result = await model.generateContent({
            contents: contentsForApi,
            generationConfig,
            safetySettings,
        });
        console.log("generate-recipe-chat.js: Received response from Gemini.");

        const response = result.response;
        if (response && response.candidates && response.candidates.length > 0) {
            const candidate = response.candidates[0];
             if (candidate.safetyRatings && candidate.safetyRatings.some(rating => rating.probability !== 'NEGLIGIBLE' && rating.blocked !== false )) {
                console.warn("generate-recipe-chat.js: Potential safety issue in response:", JSON.stringify(candidate.safetyRatings));
            }
            if (candidate.finishReason && candidate.finishReason !== 'STOP' && candidate.finishReason !== 'MAX_TOKENS') {
                console.warn("generate-recipe-chat.js: Gemini generation stopped for reason:", candidate.finishReason);
                 if (['SAFETY', 'RECITATION', 'OTHER'].includes(candidate.finishReason)) {
                     return { statusCode: 500, headers, body: JSON.stringify({ error: `AI response generation issue: ${candidate.finishReason}. Try rephrasing.`, name: "Generation Issue", ingredients: [], instructions: "Could not generate due to content policy.", tags: [] }) };
                 }
            }

            if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
                let responseText = candidate.content.parts[0].text;
                console.log("generate-recipe-chat.js: Raw responseText (first 200):", responseText.substring(0, 200) + "...");
                
                responseText = responseText.replace(/^```json\s*/im, '').replace(/\s*```$/im, '').trim();
                console.log("generate-recipe-chat.js: Cleaned responseText (first 200):", responseText.substring(0, 200) + "...");
                responseText = responseText.replace(/("quantity":\s*)(\d+\/\d+)(?=\s*[,}])/g, '$1"$2"'); // Quote fractions

                try {
                    const recipeJson = JSON.parse(responseText);
                    console.log("generate-recipe-chat.js: Successfully parsed JSON.");
                    if (recipeJson.name && Array.isArray(recipeJson.ingredients) && recipeJson.instructions && Array.isArray(recipeJson.tags)) {
                        console.log("generate-recipe-chat.js: Recipe JSON is valid, returning 200.");
                        return { statusCode: 200, headers, body: JSON.stringify(recipeJson) };
                    } else {
                        console.error("generate-recipe-chat.js: Parsed JSON missing required fields:", responseText);
                        return { statusCode: 500, headers, body: JSON.stringify({ error: "AI response did not match expected recipe structure.", rawResponse: responseText }) };
                    }
                } catch (parseError) {
                    console.error("generate-recipe-chat.js: Error parsing AI response as JSON:", parseError, "\nRaw response:", responseText);
                    return { statusCode: 500, headers, body: JSON.stringify({ error: "AI response was not valid JSON.", rawResponse: responseText, parseErrorMessage: parseError.message }) };
                }
            } else { /* ... handle no content parts ... */ }
        } else { /* ... handle no candidates ... */ }
    } catch (error) { /* ... handle outer catch ... */ }
    
    // Fallback
    console.error("generate-recipe-chat.js: Reached end of function unexpectedly.");
    return { statusCode: 500, headers, body: JSON.stringify({ error: "An unexpected error occurred generating the recipe." }) };
};
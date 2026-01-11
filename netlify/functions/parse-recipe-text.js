// In netlify/functions/parse-recipe-text.js

const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

const MODEL_NAME = "gemini-2.5-flash"; // Using your preferred model
const API_KEY = process.env.GOOGLE_GEMINI_API_KEY; // Using your API key variable
const ALLOWED_ORIGIN = process.env.CONTEXT === 'dev' ? '*' : "https://erinslist.netlify.app";

exports.handler = async (event) => {
    // --- All of your existing robust header and error handling ---
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
        return { statusCode: 500, headers: headers, body: JSON.stringify({ error: "Server configuration error: Missing API Key." }) };
    }

    let recipeText; // MODIFIED: Changed from userPrompt
    try {
        const body = JSON.parse(event.body);
        recipeText = body.recipeText; // MODIFIED: Looking for 'recipeText' from the client
        if (!recipeText || typeof recipeText !== 'string' || recipeText.trim() === '') {
            return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Bad Request: "recipeText" is required.' }) };
        }
    } catch (error) {
        return { statusCode: 400, headers: headers, body: JSON.stringify({ error: "Bad Request: Invalid JSON in request body." }) };
    }

    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    // --- MODIFIED: The prompt is now for parsing, not generating ---
    const fullPrompt = `
      You are a helpful recipe parsing assistant. Analyze the following recipe text and convert it into a structured JSON object.

      The JSON object must have the following keys: "name", "ingredients", "instructions", and "tags".
      - "name" should be a string.
      - "ingredients" should be an array of objects, where each object has "name" (string), "quantity" (string), and "unit" (string).
      - "instructions" should be a single string. If there are steps, combine them.
      - "tags" should be an array of relevant lowercase strings based on the recipe content.

      Respond ONLY with a valid, minified JSON object. Do not include markdown formatting like \`\`\`json.

      Here is the recipe text to parse:
      ---
      ${recipeText}
      ---
    `;

    // --- Your existing AI configuration (generationConfig, safetySettings) is great ---
    const generationConfig = { /* ... your config ... */ };
    const safetySettings = [ /* ... your settings ... */ ];

    try {
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
            generationConfig,
            safetySettings,
        });
        
        // --- All of your existing robust response parsing and cleaning ---
        if (result.response && result.response.candidates && result.response.candidates.length > 0) {
            const candidate = result.response.candidates[0];
            if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
                let responseText = candidate.content.parts[0].text.trim();
                
                // Your logic to clean and parse the JSON response is excellent.
                // It's not shown here for brevity but should be copied from your original function.
                // For example:
                // responseText = responseText.replace(/^```json\s*/im, '');
                // responseText = responseText.replace(/\s*```$/im, '');

                const recipeJson = JSON.parse(responseText);
                return { statusCode: 200, headers: headers, body: JSON.stringify(recipeJson) };
            }
        }
        // Fallback error if the structure isn't as expected
        throw new Error("AI response format was unexpected.");

    } catch (error) {
        console.error("Error calling Gemini API or processing response:", error);
        return { statusCode: 500, headers: headers, body: JSON.stringify({ error: `Failed to parse recipe: ${error.message}` }) };
    }
};

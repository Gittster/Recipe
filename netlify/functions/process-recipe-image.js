// functions/process-recipe-image.js
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai"); // Assuming this is at the top

// Use your actual Netlify URL for production, "*" is okay for local dev but be specific later.
const ALLOWED_ORIGIN = process.env.DEPLOY_PRIME_URL || process.env.URL || "*";
const API_KEY = process.env.GOOGLE_GEMINI_API_KEY;
const MODEL_NAME = "gemini-1.5-flash-latest"; // Or your chosen multimodal model

exports.handler = async (event) => {
    // Log invocation and basic event details first
    console.log("--- process-recipe-image FUNCTION INVOCATION START ---");
    console.log("Timestamp:", new Date().toISOString());
    console.log("HTTP Method:", event.httpMethod);
    console.log("Path:", event.path);
    console.log("Headers (first few):", JSON.stringify(Object.fromEntries(Object.entries(event.headers).slice(0, 5)))); // Log some headers
    console.log("Event Body Length:", event.body ? event.body.length : "No Body");
    // Log first few characters of body to check if it's what you expect
    console.log("Event Body (first 200 chars):", event.body ? event.body.substring(0, 200) + (event.body.length > 200 ? "..." : "") : "No Body");


    const headers = {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    if (event.httpMethod === 'OPTIONS') {
        console.log("process-recipe-image.js: Handling OPTIONS request. Responding with 204.");
        return { statusCode: 204, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        console.log("process-recipe-image.js: Incorrect HTTP method. Responding with 405.");
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed. Please use POST.' }) };
    }

    if (!API_KEY) {
        console.error("process-recipe-image.js: CRITICAL - Missing Google Gemini API Key!");
        return { statusCode: 500, headers, body: JSON.stringify({ error: "Server configuration error: Missing API Key." }) };
    }

    let imageBase64, imageMimeType;
    try {
        if (!event.body) {
            console.error("process-recipe-image.js: Request body is missing.");
            throw new Error("Request body is missing.");
        }
        const body = JSON.parse(event.body); // This can fail if body is not valid JSON or too large and truncated
        console.log("process-recipe-image.js: Successfully parsed request body.");

        imageBase64 = body.image;
        imageMimeType = body.mimeType;

        if (!imageBase64 || typeof imageBase64 !== 'string' || imageBase64.trim() === "") {
            console.error("process-recipe-image.js: 'image' (base64 string) is missing or empty.");
            throw new Error("'image' (base64 string) is required and must not be empty.");
        }
        if (!imageMimeType || typeof imageMimeType !== 'string' || imageMimeType.trim() === "") {
            console.error("process-recipe-image.js: 'mimeType' is missing or empty.");
            throw new Error("'mimeType' is required and must not be empty.");
        }
        console.log("process-recipe-image.js: Received image. MimeType:", imageMimeType, "Base64 length:", imageBase64.length);
        console.log("process-recipe-image.js: Base64 (first 50 chars):", imageBase64.substring(0, 50) + "...");

    } catch (error) {
        console.error("process-recipe-image.js: Error parsing request body or validating input:", error.message);
        return { statusCode: 400, headers, body: JSON.stringify({ error: `Bad Request: ${error.message}` }) };
    }

    console.log("process-recipe-image.js: Initializing Gemini AI with model:", MODEL_NAME);
    const genAI = new GoogleGenerativeAI(API_KEY); // Assuming this is correctly imported
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    const fullPrompt = `
        You are an expert recipe transcriber. Analyze the provided image which contains a recipe.
        Extract the following information:
        1. Recipe Name (string)
        2. Ingredients (array of objects, where each object has "name": string, "quantity": string, "unit": string. If quantity or unit are not clearly separable or present, make a reasonable interpretation or use an empty string.)
        3. Instructions (string, preferably with numbered steps or clear separation between steps).
        4. Tags (array of strings, generate 3-5 relevant keywords for the recipe like cuisine type, main ingredient, or dish type).

        Format your response strictly as a JSON object with the following structure:
        {
          "name": "The extracted recipe name",
          "ingredients": [ /* ... examples ... */ ],
          "instructions": "1. First instruction. 2. Second instruction.",
          "tags": ["dessert", "baking", "easy"]
        }
        If any part of the recipe is unreadable or unclear, make your best guess or use a placeholder like "UNKNOWN" or an empty string for that specific part. If no recipe is detected in the image, return an error field in the JSON like {"error": "No recipe detected in the image."}.
        Ensure the output is ONLY the JSON object, with no surrounding text or markdown.
    `;

    const imagePart = {
        inlineData: {
            data: imageBase64,
            mimeType: imageMimeType
        }
    };

    const generationConfig = { temperature: 0.3, maxOutputTokens: 4096 }; // More tokens for potentially dense image text
    const safetySettings = [ /* ... your safety settings ... */ ];

    console.log("process-recipe-image.js: Attempting to generate content with Gemini using image and prompt.");
    try {
        const result = await model.generateContent({
             contents: [{ role: "user", parts: [{ text: fullPrompt }, imagePart] }],
             generationConfig,
             safetySettings
        });
        console.log("process-recipe-image.js: Received response from Gemini.");

        const response = result.response;
        if (!response || !response.candidates || response.candidates.length === 0 || !response.candidates[0].content || !response.candidates[0].content.parts || response.candidates[0].content.parts.length === 0) {
            console.error("process-recipe-image.js: Invalid or empty response structure from Gemini:", JSON.stringify(response, null, 2));
            throw new Error("AI did not return valid content.");
        }
        
        const candidate = response.candidates[0];
        // ... (Safety checks from previous version) ...

        let responseText = candidate.content.parts[0].text;
        console.log("process-recipe-image.js: Raw Gemini responseText (first 300):", responseText.substring(0, 300) + "...");
        
        responseText = responseText.replace(/^```json\s*/im, '').replace(/\s*```$/im, '').trim();
        console.log("process-recipe-image.js: Cleaned Gemini responseText (first 300):", responseText.substring(0, 300) + "...");
        responseText = responseText.replace(/("quantity":\s*)(\d+\/\d+)(?=\s*[,}])/g, '$1"$2"');

        try {
            const recipeJson = JSON.parse(responseText);
            console.log("process-recipe-image.js: Successfully parsed recipeJson from Gemini.");
            if (recipeJson.error) { // Check if AI itself returned an error object
                console.warn("process-recipe-image.js: AI returned an error in its JSON:", recipeJson.error);
                return { statusCode: 400, headers, body: JSON.stringify({ error: recipeJson.error, rawResponse: responseText }) };
            }
            if (recipeJson.name && Array.isArray(recipeJson.ingredients) && recipeJson.instructions) {
                recipeJson.tags = recipeJson.tags || [];
                console.log("process-recipe-image.js: Recipe JSON is valid, returning 200.");
                return { statusCode: 200, headers, body: JSON.stringify(recipeJson) };
            } else {
                console.error("process-recipe-image.js: Parsed JSON missing required fields (name, ingredients, instructions):", recipeJson);
                throw new Error("AI response did not provide all required recipe fields.");
            }
        } catch (parseError) {
            console.error("process-recipe-image.js: Error parsing AI response as JSON:", parseError, "\nRaw response was:", responseText);
            return { statusCode: 500, headers, body: JSON.stringify({ error: "AI response was not valid JSON.", rawResponse: responseText, parseErrorMessage: parseError.message }) };
        }
    } catch (error) {
        const errorMessage = error && error.message ? error.message : "Unknown error during Gemini API call or processing.";
        console.error("process-recipe-image.js: Error calling Gemini API or processing response:", { message: errorMessage, stack: error.stack, errorObjectString: JSON.stringify(error, Object.getOwnPropertyNames(error)) });
        return { statusCode: 500, headers, body: JSON.stringify({ error: `Failed to process recipe image with AI: ${errorMessage}` }) };
    }
};
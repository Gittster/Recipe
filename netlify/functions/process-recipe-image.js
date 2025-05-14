// functions/process-recipe-image.js
console.log("process-recipe-image.js: Top of file, loading modules.");

const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
console.log("process-recipe-image.js: GoogleGenerativeAI module loaded.");

const MODEL_NAME = "gemini-1.5-flash-latest"; // Multimodal model
const API_KEY = process.env.GOOGLE_GEMINI_API_KEY;
console.log("process-recipe-image.js: API_KEY defined?", !!API_KEY);

const ALLOWED_ORIGIN = "https://erinslist.netlify.app"; // Your Netlify app's domain
console.log("process-recipe-image.js: ALLOWED_ORIGIN defined.");

exports.handler = async (event) => {
    console.log("process-recipe-image.js: Handler started. Event HTTP method:", event.httpMethod);

    const headers = {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    if (event.httpMethod === 'OPTIONS') {
        console.log("process-recipe-image.js: Handling OPTIONS request.");
        return { statusCode: 204, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        console.log("process-recipe-image.js: Incorrect HTTP method.");
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    if (!API_KEY) {
        console.error("process-recipe-image.js: Missing Google Gemini API Key!");
        return { statusCode: 500, headers, body: JSON.stringify({ error: "Server configuration error: Missing API Key." }) };
    }

    let imageBase64, imageMimeType;
    try {
        console.log("process-recipe-image.js: Parsing request body.");
        if (!event.body) {
            throw new Error("Request body is missing.");
        }
        const body = JSON.parse(event.body);
        imageBase64 = body.image;
        imageMimeType = body.mimeType;

        if (!imageBase64 || !imageMimeType) {
            throw new Error("'image' (base64 string) and 'mimeType' are required.");
        }
        console.log("process-recipe-image.js: Image data received. MimeType:", imageMimeType);
    } catch (error) {
        console.error("process-recipe-image.js: Error parsing request body:", error);
        return { statusCode: 400, headers, body: JSON.stringify({ error: `Bad Request: ${error.message}` }) };
    }

    console.log("process-recipe-image.js: Initializing Gemini AI with model:", MODEL_NAME);
    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    const fullPrompt = `
        You are an expert recipe transcriber. Analyze the provided image which contains a recipe.
        Extract the following information:
        1. Recipe Name (string)
        2. Ingredients (array of objects, where each object has "name": string, "quantity": string, "unit": string. If quantity or unit are not clearly separable or present, make a reasonable interpretation or use an empty string.)
        3. Instructions (string, ideally as a single string with steps clearly demarcated, e.g., by numbers or newlines that will be preserved or converted to \\n).
        4. Tags (array of strings, generate 3-5 relevant keywords for the recipe like cuisine type, main ingredient, or dish type).

        Format your response strictly as a JSON object with the following structure:
        {
          "name": "The extracted recipe name",
          "ingredients": [
            { "name": "Flour", "quantity": "2", "unit": "cups" },
            { "name": "Sugar", "quantity": "1/2", "unit": "cup" },
            { "name": "Eggs", "quantity": "3", "unit": "" }
          ],
          "instructions": "1. Mix flour and sugar. 2. Beat eggs and add to mixture. 3. Bake at 350°F for 30 minutes.",
          "tags": ["dessert", "baking", "cake"]
        }

        If any part of the recipe is unreadable or unclear, make your best guess or use a placeholder like "UNKNOWN" or an empty string for that specific part.
        For quantities, ensure they are represented as strings (e.g., "1/2", "1", "to taste").
        Ensure the output is ONLY the JSON object, with no surrounding text, comments, or markdown code fences (like \`\`\`json).
    `;

    const imagePart = {
        inlineData: {
            data: imageBase64,
            mimeType: imageMimeType
        }
    };

    console.log("process-recipe-image.js: Attempting to generate content with Gemini using image and prompt.");
    try {
        const result = await model.generateContent({
             contents: [{ role: "user", parts: [{ text: fullPrompt }, imagePart] }]
             // Note: Depending on the exact SDK version and model, `generateContentStream` might also be an option
             // for larger responses or if you want to show progress. For now, `generateContent` is simpler.
        });
        console.log("process-recipe-image.js: Received response from Gemini.");

        const response = result.response; // Correct way to access response with current SDK

        if (response && response.candidates && response.candidates.length > 0) {
            const candidate = response.candidates[0];
            // Check for safety ratings if necessary (omitted for brevity here, but good for production)
            // if (candidate.finishReason !== 'STOP' && candidate.finishReason !== 'MAX_TOKENS') {
            //     console.warn("Gemini generation stopped for reason:", candidate.finishReason, candidate.safetyRatings);
            //     // Handle potentially incomplete or blocked content
            // }

            if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
                let responseText = candidate.content.parts[0].text;
                console.log("process-recipe-image.js: Raw responseText from Gemini (first 300 chars):", responseText.substring(0, 300) + "...");
                
                // Cleaning (already robust, but double check if Gemini adds markdown for JSON from image prompts)
                responseText = responseText.replace(/^```json\s*/im, '').replace(/\s*```$/im, '').trim();
                console.log("process-recipe-image.js: Cleaned responseText (first 300 chars):", responseText.substring(0, 300) + "...");

                // Sanitize bare fractions (important)
                responseText = responseText.replace(/("quantity":\s*)(\d+\/\d+)(?=\s*[,}])/g, '$1"$2"');
                console.log("process-recipe-image.js: responseText after quoting fractions (first 300 chars):", responseText.substring(0, 300) + "...");

                try {
                    const recipeJson = JSON.parse(responseText);
                    console.log("process-recipe-image.js: Successfully parsed JSON.");
                    // Validate essential fields more thoroughly if needed
                    if (recipeJson.name && Array.isArray(recipeJson.ingredients) && typeof recipeJson.instructions === 'string') { // NEW
                        recipeJson.tags = recipeJson.tags || []; // Ensure tags array exists
                        console.log("process-recipe-image.js: Recipe JSON structure is acceptable (instructions might be empty), returning 200.");
                        return { statusCode: 200, headers: headers, body: JSON.stringify(recipeJson) };
                    } else {
                        console.error("process-recipe-image.js: Parsed JSON is missing required recipe fields (name or ingredients array, or instructions not a string):", responseText);
                        return { statusCode: 500, headers: headers, body: JSON.stringify({ error: "AI response did not provide all critical recipe fields (name, ingredients) or instructions was not a string.", rawResponse: responseText }) };
                    }
                } catch (parseError) {
                    console.error("process-recipe-image.js: Error parsing AI response as JSON (inner catch):", parseError, "\nRaw response that failed parsing was:", responseText);
                    return { statusCode: 500, headers, body: JSON.stringify({ error: "AI response was not valid JSON after sanitization.", rawResponse: responseText, parseErrorMessage: parseError.message }) };
                }
            } else {
                console.error("process-recipe-image.js: AI response candidate has no text content parts:", JSON.stringify(candidate.content, null, 2));
                return { statusCode: 500, headers, body: JSON.stringify({ error: "AI response candidate had no text content." }) };
            }
        } else {
            const errorMessage = "AI did not return any usable response candidates, or the response structure was unexpected.";
            console.error("process-recipe-image.js:", errorMessage, JSON.stringify(response, null, 2));
            return { statusCode: 500, headers, body: JSON.stringify({ error: errorMessage, details: "No candidates in response." }) };
        }
    } catch (error) {
        const errorMessage = error && error.message ? error.message : "Unknown error during API call or response processing.";
        const errorStack = error && error.stack ? error.stack : "No stack available.";
        console.error("process-recipe-image.js: Error calling Gemini API or processing response (outer catch):", { message: errorMessage, stack: errorStack, errorObjectString: JSON.stringify(error, Object.getOwnPropertyNames(error)) });
        return { statusCode: 500, headers, body: JSON.stringify({ error: `Failed to generate recipe from image: ${errorMessage}` }) };
    }
};
// functions/process-recipe-image.js
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

const ALLOWED_ORIGIN = process.env.CONTEXT === 'dev' ? '*' : "https://erinslist.netlify.app";
const API_KEY = process.env.GOOGLE_GEMINI_API_KEY;
const MODEL_NAME = "gemini-2.5-flash"; // Multimodal model

exports.handler = async (event) => {
    console.log("--- process-recipe-image FUNCTION INVOCATION START ---");
    console.log("Timestamp:", new Date().toISOString());
    console.log("HTTP Method:", event.httpMethod);

    const headers = {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    if (event.httpMethod === 'OPTIONS') {
        console.log("Handling OPTIONS request.");
        return { statusCode: 204, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        console.log("Incorrect HTTP method. Responding with 405.");
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed. Please use POST.' }) };
    }

    if (!API_KEY) {
        console.error("CRITICAL - Missing Google Gemini API Key!");
        return { statusCode: 500, headers, body: JSON.stringify({ error: "Server configuration error: Missing API Key." }) };
    }

    let imageBase64, imageMimeType, promptType;

    try {
        if (!event.body) {
            throw new Error("Request body is missing.");
        }
        const body = JSON.parse(event.body);
        console.log("Successfully parsed request body.");

        imageBase64 = body.image;
        imageMimeType = body.mimeType;
        promptType = body.promptType || 'extract'; // Default to 'extract' if not provided

        if (!imageBase64 || typeof imageBase64 !== 'string' || imageBase64.trim() === "") {
            throw new Error("'image' (base64 string) is required and must not be empty.");
        }
        if (!imageMimeType || typeof imageMimeType !== 'string' || imageMimeType.trim() === "") {
            throw new Error("'mimeType' is required and must not be empty.");
        }
        console.log("Received image. MimeType:", imageMimeType, "Base64 length:", imageBase64.length, "PromptType:", promptType);

    } catch (error) {
        console.error("Error parsing request body or validating input:", error.message);
        return { statusCode: 400, headers, body: JSON.stringify({ error: `Bad Request: ${error.message}` }) };
    }

    console.log("Initializing Gemini AI with model:", MODEL_NAME);
    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    let fullPrompt;

    // --- Select Prompt Based on promptType ---
    if (promptType === 'generate-from-food') {
        console.log("Using 'generate-from-food' prompt.");
        fullPrompt = `
You are a creative and experienced chef. Analyze the provided image of a finished dish.
Based on the visual appearance of the food, generate a plausible recipe for it.
Your goal is to create a complete, usable recipe.

Return ONLY a single valid JSON object with this exact structure:
{
  "name": "Generated Recipe Name",
  "ingredients": [ { "name": "Example Chicken Breast", "quantity": "2", "unit": "pieces" }, ... ],
  "instructions": ["1. Preheat your oven to 375°F (190°C).", "2. Season the chicken..."],
  "tags": ["main course", "chicken", "easy"]
}

Important constraints:
- "instructions" MUST be a JSON array where each element is one step string and MUST begin with a step number in the format "N." or "N)" (for example: "1. Preheat the oven...").
- Do NOT return a single string containing multiple numbered steps.
- Preserve measurements such as "3-inch" or "3 in" inside step text; do not allow them to be treated as standalone step numbers.
- If no food is detected, return {"error": "No recognizable food detected in the image."} (still JSON only).
- Output ONLY the JSON object with no surrounding text, markdown, or code fences.
        `;
    } else { // Default to 'extract' (original functionality)
        console.log("Using 'extract' (default) prompt.");
        fullPrompt = `
You are an expert recipe transcriber. Analyze the provided image which contains a recipe (likely text).
Extract the following information and return ONLY a valid JSON object with this shape:
{
  "name": "The extracted recipe name",
  "ingredients": [ { "name": "Flour", "quantity": "1", "unit": "cup" } ],
  "instructions": ["1. First instruction.", "2. Second instruction."],
  "tags": ["dessert", "baking", "easy"]
}
Important constraints:
- "instructions" MUST be a JSON array where each element is one step string and MUST begin with a step number in the format "N." or "N)". Do NOT return a single string containing multiple steps.
- If parts are unreadable, make a best effort guess or use empty strings, but keep JSON valid.
- If no recipe is detected, return {"error": "No recipe detected in the image."} (JSON only).
- Output ONLY the JSON object, no markdown, no code fences, no extra text.
        `;
    }

    const imagePart = {
        inlineData: { data: imageBase64, mimeType: imageMimeType }
    };

    const generationConfig = { temperature: 0.4, maxOutputTokens: 4096 }; // Adjusted temp
    const safetySettings = [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ];

    console.log(`Attempting to generate content with Gemini using prompt type: ${promptType}.`);

    // Retry wrapper to handle transient rate-limit/heavy-use errors from Gemini
    async function retryGenerateContent(modelInstance, payload, attempts = 5, baseDelay = 500) {
        for (let i = 0; i < attempts; i++) {
            try {
                return await modelInstance.generateContent(payload);
            } catch (err) {
                const msg = err && err.message ? err.message : '';
                const shouldRetry = /429|rate limit|quota|temporar|timeout|service unavailable/i.test(msg);
                if (i === attempts - 1 || !shouldRetry) throw err;
                const jitter = Math.floor(Math.random() * 300) + 100;
                const delay = baseDelay * Math.pow(2, i) + jitter;
                console.warn(`process-recipe-image.js: Retry attempt ${i + 1} failed: ${msg}. Backing off ${delay}ms.`);
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }

    try {
        const result = await retryGenerateContent(model, {
             contents: [{ role: "user", parts: [{ text: fullPrompt }, imagePart] }],
             generationConfig,
             safetySettings
        });
        console.log("Received response from Gemini.");

        const response = result.response;
        if (!response || !response.candidates || response.candidates.length === 0) {
            console.error("Invalid or empty response structure from Gemini:", JSON.stringify(response, null, 2));
            throw new Error("AI did not return valid content candidates.");
        }
        
        const candidate = response.candidates[0];
        if (candidate.safetyRatings && candidate.safetyRatings.some(rating => rating.blocked || rating.probability !== 'NEGLIGIBLE')) {
            console.warn("Potential safety issue or blocked content in response:", JSON.stringify(candidate.safetyRatings));
            if (candidate.finishReason === 'SAFETY' || candidate.safetyRatings.some(r => r.blocked)) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: "Response blocked by AI due to safety settings. Please try a different image or prompt."}) };
            }
        }
        if (candidate.finishReason && !['STOP', 'MAX_TOKENS'].includes(candidate.finishReason)) {
            console.warn("Gemini generation stopped for reason:", candidate.finishReason);
            if (['SAFETY', 'RECITATION', 'OTHER'].includes(candidate.finishReason)) {
                 return { statusCode: 500, headers, body: JSON.stringify({ error: `AI response generation issue: ${candidate.finishReason}. Try rephrasing.` }) };
            }
        }

        if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0 || !candidate.content.parts[0].text) {
            console.error("AI response candidate has no text content parts:", JSON.stringify(candidate, null, 2));
            throw new Error("AI response candidate had no text content.");
        }

        let responseText = candidate.content.parts[0].text;
        console.log("Raw Gemini responseText (first 300):", responseText.substring(0, 300) + "...");
        
        responseText = responseText.replace(/^```json\s*/im, '').replace(/\s*```$/im, '').trim();
        console.log("Cleaned Gemini responseText (first 300):", responseText.substring(0, 300) + "...");
        responseText = responseText.replace(/("quantity":\s*)(\d+\/\d+)(?=\s*[,}])/g, '$1"$2"'); // Quote bare fractions for quantity

        try {
            const recipeJson = JSON.parse(responseText);
            console.log("Successfully parsed recipeJson from Gemini.");
            if (recipeJson.error) {
                console.warn("AI returned an error in its JSON:", recipeJson.error);
                return { statusCode: 400, headers, body: JSON.stringify({ error: recipeJson.error }) }; // Send error to client
            }

            // Normalize instructions into array form where each element starts with a numbering token like "1." or "1)"
            if (typeof recipeJson.instructions === 'string') {
                const rawLines = recipeJson.instructions.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
                const steps = [];
                rawLines.forEach(line => {
                    const parts = line.split(/(?=\b\d+[\.\)])/).map(p => p.trim()).filter(Boolean);
                    parts.forEach(p => {
                        if (!/^\d+[\.\)]\s*/.test(p)) {
                            steps.push((steps.length + 1) + '. ' + p);
                        } else {
                            steps.push(p);
                        }
                    });
                });
                recipeJson.instructions = steps;
            } else if (Array.isArray(recipeJson.instructions)) {
                recipeJson.instructions = recipeJson.instructions.map((s, idx) => {
                    const str = String(s).trim();
                    return /^\d+[\.\)]\s*/.test(str) ? str : (idx + 1) + '. ' + str;
                }).filter(Boolean);
            } else {
                recipeJson.instructions = [];
            }

            // Basic validation for core recipe fields
            if (recipeJson.name && Array.isArray(recipeJson.ingredients) && Array.isArray(recipeJson.instructions)) {
                recipeJson.tags = recipeJson.tags || []; // Ensure tags array exists
                console.log("Recipe JSON is valid, returning 200.");
                return { statusCode: 200, headers, body: JSON.stringify(recipeJson) };
            } else {
                console.error("Parsed JSON missing required fields (name, ingredients, instructions):", recipeJson);
                throw new Error("AI response did not provide all required recipe fields in the expected structure.");
            }
        } catch (parseError) {
            console.error("Error parsing AI response as JSON:", parseError, "\nRaw response that failed was:", responseText);
            return { statusCode: 500, headers, body: JSON.stringify({ error: "AI response was not valid JSON.", rawResponse: responseText, parseErrorMessage: parseError.message }) };
        }
    } catch (error) {
        const errorMessage = error && error.message ? error.message : "Unknown error during Gemini API call or processing.";
        console.error("Error calling Gemini API or processing response:", error); // Log the full error object
        return { statusCode: 500, headers, body: JSON.stringify({ error: `Failed to process recipe image with AI: ${errorMessage}` }) };
    }
};

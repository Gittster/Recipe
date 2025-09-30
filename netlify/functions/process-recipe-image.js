// functions/process-recipe-image.js
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

const ALLOWED_ORIGIN = process.env.DEPLOY_PRIME_URL || process.env.URL || "*"; // More flexible for local dev
const API_KEY = process.env.GOOGLE_GEMINI_API_KEY;
const MODEL_NAME = "gemini-2.0-flash"; // Multimodal model

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

1.  Invent an appealing and descriptive Recipe Name (string).
2.  List the likely Ingredients as an array of objects. Each object *must* have "name" (string), "quantity" (string), and "unit" (string) fields.
    * For "name": Identify the core ingredients visible or strongly implied by the dish.
    * For "quantity" and "unit": Provide your best culinary estimate for a standard preparation of this dish (e.g., serving 2-4 people). Examples: "1", "1/2", "200", "to taste". If a precise numeric quantity is impossible to guess, use descriptive terms like "1 large" for an onion, or "a pinch" for salt, but still try to populate the quantity field. If the unit is obvious (e.g., "1" for "onion", the unit could be "medium" or "large" or even an empty string if implied by quantity). For spices, "1 tsp" or "to taste" is acceptable. You MUST attempt to provide a value for both quantity and unit for every ingredient. If truly indeterminable, quantity can be an empty string and unit can be an empty string or a general term like "piece(s)".
3.  Write clear, step-by-step Instructions (string) on how to prepare the dish.
4.  Generate 3-5 relevant Tags (array of strings) for the dish (e.g., "dinner", "chicken", "roasted", "comfort food").

Format your response strictly as a JSON object with the structure:
{
  "name": "Generated Recipe Name",
  "ingredients": [
    { "name": "Example Chicken Breast", "quantity": "2", "unit": "pieces" },
    { "name": "Olive Oil", "quantity": "1", "unit": "tbsp" },
    { "name": "Salt", "quantity": "a pinch", "unit": "" }
  ],
  "instructions": "1. Preheat your oven to 375°F (190°C).\n2. Season the chicken breasts with salt and pepper.\n3. Sear the chicken in olive oil until golden brown.\n4. Transfer to the oven and bake for 20-25 minutes, or until cooked through.",
  "tags": ["main course", "chicken", "easy", "baked"]
}
If the image does not appear to be food or a recognizable dish, return JSON with an error field: {"error": "No recognizable food detected in the image."}.
Ensure the output is ONLY the JSON object, with no surrounding text or markdown.
        `;
    } else { // Default to 'extract' (original functionality)
        console.log("Using 'extract' (default) prompt.");
        fullPrompt = `
You are an expert recipe transcriber. Analyze the provided image which contains a recipe (likely text).
Extract the following information:
1. Recipe Name (string)
2. Ingredients (array of objects, where each object has "name": string, "quantity": string, "unit": string. If quantity or unit are not clearly separable or present, make a reasonable interpretation or use an empty string.)
3. Instructions (string, preferably with numbered steps or clear separation between steps).
4. Tags (array of strings, generate 3-5 relevant keywords for the recipe like cuisine type, main ingredient, or dish type).

Format your response strictly as a JSON object with the following structure:
{
  "name": "The extracted recipe name",
  "ingredients": [ { "name": "Flour", "quantity": "1", "unit": "cup" } ],
  "instructions": "1. First instruction. 2. Second instruction.",
  "tags": ["dessert", "baking", "easy"]
}
If any part of the recipe is unreadable or unclear, make your best guess or use a placeholder like "UNKNOWN" or an empty string for that specific part. If no recipe is detected in the image, return an error field in the JSON like {"error": "No recipe detected in the image."}.
Ensure the output is ONLY the JSON object, with no surrounding text or markdown.
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
    try {
        const result = await model.generateContent({
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
            // Basic validation for core recipe fields
            if (recipeJson.name && Array.isArray(recipeJson.ingredients) && recipeJson.instructions) {
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

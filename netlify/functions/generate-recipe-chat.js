// functions/generate-recipe-chat.js
console.log("generate-recipe-chat.js: Top of file, loading modules."); // LOG 1 (from prev suggestion)

const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
console.log("generate-recipe-chat.js: GoogleGenerativeAI module loaded."); // LOG 2

const MODEL_NAME = "gemini-1.5-flash";
const API_KEY = process.env.GOOGLE_GEMINI_API_KEY;
// LOG 3 - Check if API_KEY is actually loaded.
// It's important to see this in logs if they become non-empty.
console.log("generate-recipe-chat.js: API_KEY defined?", !!API_KEY); 

// Define your app's origin.
const ALLOWED_ORIGIN = "https://beamish-baklava-a99968.netlify.app";
console.log("generate-recipe-chat.js: ALLOWED_ORIGIN defined."); // LOG 4

exports.handler = async (event) => {
    // ... (keep your initial console logs, headers definition, OPTIONS, POST, API_KEY, prompt parsing checks) ...

    console.log("generate-recipe-chat.js: Initializing Gemini AI.");
    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    const fullPrompt = `
        You are a helpful recipe assistant called Chef Bot.
        A user wants a recipe. Their request is: "${userPrompt}"

        Please generate a recipe based on this request.
        The recipe should include a name, a list of ingredients (each with name, quantity, and unit),
        step-by-step instructions, and a few relevant tags (as an array of strings).
        All string values in the JSON must be properly escaped.
        For "quantity", provide values as JSON numbers (e.g., 1, 0.5, 200) or as strings (e.g., "1/2", "to taste").
        Do not use unquoted bare fractions like 1/2 as values for "quantity".

        Respond ONLY with a valid JSON object in the following format:
        {
          "name": "Recipe Name",
          "ingredients": [ { "name": "Ingredient 1", "quantity": "1", "unit": "cup" } ],
          "instructions": "1. Step one.",
          "tags": ["tag1"]
        }
        Ensure the output is strictly JSON.
    `; // I've slightly enhanced the prompt to re-emphasize string/number for quantity.

    // ... (generationConfig, safetySettings remain the same) ...

    console.log("generate-recipe-chat.js: Attempting to generate content with Gemini.");
    try {
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
            generationConfig,
            safetySettings,
        });
        console.log("generate-recipe-chat.js: Received response from Gemini.");

        if (result.response && result.response.candidates && result.response.candidates.length > 0) {
            const candidate = result.response.candidates[0];
            if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
                let responseText = candidate.content.parts[0].text;
                console.log("generate-recipe-chat.js: Raw responseText from Gemini (first 200 chars):", responseText.substring(0, 200) + "...");
                
                responseText = responseText.replace(/^```json\s*/im, '');
                responseText = responseText.replace(/\s*```$/im, '');
                responseText = responseText.trim();
                console.log("generate-recipe-chat.js: Cleaned responseText (first 200 chars):", responseText.substring(0, 200) + "...");

                // === START: Sanitize bare fractions for "quantity" fields ===
                // This regex looks for "quantity": followed by optional spaces, then a bare fraction (e.g., 1/2, 3/4)
                // that is NOT already in quotes, and then ensures it's followed by a comma or closing curly brace.
                // It then puts quotes around the bare fraction.
                responseText = responseText.replace(/("quantity":\s*)(\d+\/\d+)(?=\s*[,}])/g, '$1"$2"');
                console.log("generate-recipe-chat.js: responseText after quoting fractions (first 200 chars):", responseText.substring(0, 200) + "...");
                // === END: Sanitize bare fractions ===

                try {
                    const recipeJson = JSON.parse(responseText); // This is line 109 in your log's context
                    console.log("generate-recipe-chat.js: Successfully parsed JSON.");
                    if (recipeJson.name && Array.isArray(recipeJson.ingredients) && recipeJson.instructions && Array.isArray(recipeJson.tags)) {
                        console.log("generate-recipe-chat.js: Recipe JSON is valid, returning 200.");
                        return { statusCode: 200, headers: headers, body: JSON.stringify(recipeJson) };
                    } else {
                        console.error("generate-recipe-chat.js: Parsed JSON is missing required recipe fields:", responseText);
                        return { statusCode: 500, headers: headers, body: JSON.stringify({ error: "AI response did not match expected recipe structure.", rawResponse: responseText }) };
                    }
                } catch (parseError) {
                    console.error("generate-recipe-chat.js: Error parsing AI response as JSON (inner catch):", parseError, "\nRaw response that failed parsing was:", responseText);
                    // The detailed character inspection log you had here was very helpful.
                    // You can keep it or remove it now that we've likely found the main cause.
                    // For brevity, I'll omit it here but you know how to add it back if needed.
                    return { 
                        statusCode: 500, 
                        headers: headers, 
                        body: JSON.stringify({ 
                            error: "AI response was not valid JSON after sanitization.", 
                            rawResponse: responseText, 
                            parseErrorMessage: parseError.message 
                        }) 
                    };
                }
            } else {
                // ... (your existing error handling for no content parts)
                console.error("generate-recipe-chat.js: AI response candidate has no content parts:", candidate);
                return { statusCode: 500, headers: headers, body: JSON.stringify({ error: "AI response candidate has no content parts." }) };
            }
        } else {
            // ... (your existing error handling for no candidates)
            const errorMessage = "AI did not return a usable response candidate.";
            console.error("generate-recipe-chat.js:", errorMessage, result.response);
            return { statusCode: 500, headers: headers, body: JSON.stringify({ error: errorMessage, details: result.response }) };
        }
    } catch (error) { // Outermost catch
        // ... (your existing outermost catch block)
        const errorMessage = error && error.message ? error.message : "Unknown error during API call or response processing.";
        const errorStack = error && error.stack ? error.stack : "No stack available.";
        console.error("generate-recipe-chat.js: Error calling Gemini API or processing response (outer catch):", { message: errorMessage, stack: errorStack, errorObject: error });
        return { statusCode: 500, headers: headers, body: JSON.stringify({ error: `Failed to generate recipe: ${errorMessage}` }) };
    }
};
// functions/generate-recipe-chat.js
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

const MODEL_NAME = "gemini-1.5-flash";
const API_KEY = process.env.GOOGLE_GEMINI_API_KEY;

// Define your app's origin. Since you're running from Netlify, this is for consistency
// or if you ever need to call it from a different subdomain/localhost for testing.
// Using your Netlify app's domain is good. '*' is also an option for wider testing.
const ALLOWED_ORIGIN = "https://beamish-baklava-a99968.netlify.app";

exports.handler = async (event) => {
    // Define the headers object at the top of the handler
    const headers = {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json" // Ensure all responses are marked as JSON
    };

    // Handle OPTIONS preflight request (good practice for CORS)
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 204,
            headers: headers, // Use the defined headers
            body: '',
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: headers, // Use the defined headers
            body: JSON.stringify({ error: 'Method Not Allowed' }), // Stringify body
        };
    }

    if (!API_KEY) {
        console.error("Missing Google Gemini API Key");
        return {
            statusCode: 500,
            headers: headers, // Use the defined headers
            body: JSON.stringify({ error: "Server configuration error: Missing API Key." }),
        };
    }

    let userPrompt;
    try {
        const body = JSON.parse(event.body);
        userPrompt = body.prompt;
        if (!userPrompt || typeof userPrompt !== 'string' || userPrompt.trim() === '') {
            return {
                statusCode: 400,
                headers: headers, // Use the defined headers
                body: JSON.stringify({ error: 'Bad Request: "prompt" is required and must be a non-empty string.' }),
            };
        }
    } catch (error) {
        console.error("Error parsing request body:", error);
        return {
            statusCode: 400,
            headers: headers, // Use the defined headers
            body: JSON.stringify({ error: "Bad Request: Invalid JSON in request body." })
        };
    }

    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    const fullPrompt = `
        You are a helpful recipe assistant called Chef Bot.
        A user wants a recipe. Their request is: "${userPrompt}"

        Please generate a recipe based on this request.
        The recipe should include a name, a list of ingredients (each with name, quantity, and unit),
        step-by-step instructions, and a few relevant tags (as an array of strings).

        Respond ONLY with a valid JSON object in the following format:
        {
          "name": "Recipe Name",
          "ingredients": [
            { "name": "Ingredient 1", "quantity": "1", "unit": "cup" },
            { "name": "Ingredient 2", "quantity": "200", "unit": "grams" }
          ],
          "instructions": "1. Step one. 2. Step two. 3. Step three.",
          "tags": ["tag1", "tag2", "relevant-tag"]
        }

        If the request is unclear or not recipe-related, try your best to create a simple, imaginative recipe,
        or politely state you can only generate recipes and provide a sample JSON recipe structure as an example of what you can do.
        Ensure the output is strictly JSON.
    `;

    const generationConfig = {
        temperature: 0.7,
        topK: 1,
        topP: 1,
        maxOutputTokens: 2048,
    };

    const safetySettings = [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ];

    try {
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
            generationConfig,
            safetySettings,
        });

        if (result.response && result.response.candidates && result.response.candidates.length > 0) {
            const candidate = result.response.candidates[0];
            if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
                let responseText = candidate.content.parts[0].text;
                responseText = responseText.replace(/^```json\s*/im, '');
                responseText = responseText.replace(/\s*```$/im, '');
                responseText = responseText.trim();

                try {
                    const recipeJson = JSON.parse(responseText);
                    if (recipeJson.name && Array.isArray(recipeJson.ingredients) && recipeJson.instructions && Array.isArray(recipeJson.tags)) {
                        return {
                            statusCode: 200,
                            headers: headers, // Use defined headers
                            body: JSON.stringify(recipeJson),
                        };
                    } else {
                        console.error("Generated JSON is missing required recipe fields:", responseText);
                        return {
                            statusCode: 500,
                            headers: headers, // Use defined headers
                            body: JSON.stringify({ error: "AI response did not match expected recipe structure.", rawResponse: responseText }),
                        };
                    }
                } catch (parseError) {
                    console.error("Error parsing AI response as JSON:", parseError, "\nRaw response that failed parsing was:", responseText);
                    return {
                        statusCode: 500,
                        headers: headers, // Use defined headers
                        body: JSON.stringify({ error: "AI response was not valid JSON.", rawResponse: responseText }),
                    };
                }
            } else {
                console.error("AI response candidate has no content parts:", candidate);
                return {
                    statusCode: 500,
                    headers: headers, // Use defined headers
                    body: JSON.stringify({ error: "AI response candidate has no content parts." }),
                };
            }
        } else {
            // This was `throw new Error(...)` before. Changing to return a proper object.
            const errorMessage = "AI did not return a usable response candidate.";
            console.error(errorMessage, result.response);
            return {
                statusCode: 500,
                headers: headers, // Use defined headers
                body: JSON.stringify({ error: errorMessage, details: result.response }),
            };
        }

    } catch (error) { // This is the outermost catch (around line 120)
        const errorMessage = error && error.message ? error.message : "Unknown error during API call or response processing.";
        const errorStack = error && error.stack ? error.stack : "No stack available.";
        console.error("Error calling Gemini API or processing response (outer catch):", {
            message: errorMessage,
            stack: errorStack,
            errorObject: error
        });
        return {
            statusCode: 500,
            headers: headers, // Use defined headers HERE
            body: JSON.stringify({ error: `Failed to generate recipe: ${errorMessage}` }),
        };
    }
};
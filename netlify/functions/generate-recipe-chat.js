// functions/generate-recipe-chat.js
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

const MODEL_NAME = "gemini-1.5-flash"; // Or another suitable model
const API_KEY = process.env.GOOGLE_GEMINI_API_KEY;

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    if (!API_KEY) {
        console.error("Missing Google Gemini API Key");
        return {
            statusCode: 500,
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
                body: JSON.stringify({ error: 'Bad Request: "prompt" is required and must be a non-empty string.' }),
            };
        }
    } catch (error) {
        console.error("Error parsing request body:", error);
        return { statusCode: 400, body: JSON.stringify({ error: "Bad Request: Invalid JSON in request body." }) };
    }

    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    // IMPORTANT: Prompt Engineering is key!
    // Guide the AI to return a JSON structure that matches your frontend's needs.
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
        temperature: 0.7, // Adjust for creativity vs. predictability
        topK: 1,
        topP: 1,
        maxOutputTokens: 2048, // Adjust as needed
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

                // Clean the response to ensure it's valid JSON
                // Sometimes the model might wrap the JSON in backticks or add "json" prefix
                responseText = responseText.replace(/^```json\s*/, '').replace(/\s*```$/, '');

                try {
                    const recipeJson = JSON.parse(responseText);
                    // Basic validation of the parsed JSON structure
                    if (recipeJson.name && Array.isArray(recipeJson.ingredients) && recipeJson.instructions && Array.isArray(recipeJson.tags)) {
                        return {
                            statusCode: 200,
                            body: JSON.stringify(recipeJson), // Send the parsed JSON
                        };
                    } else {
                        console.error("Generated JSON is missing required recipe fields:", recipeText);
                        throw new Error("AI response did not match expected recipe structure.");
                    }
                } catch (parseError) {
                    console.error("Error parsing AI response as JSON:", parseError, "\nRaw response was:", responseText);
                    // Fallback: return the raw text if it's not parsable but might still be useful for debugging
                    // Or return a more structured error
                    return {
                        statusCode: 500,
                        body: JSON.stringify({ error: "AI response was not valid JSON.", rawResponse: responseText }),
                    };
                }
            } else {
                 console.error("AI response candidate has no content parts:", candidate);
                 throw new Error("AI response candidate has no content parts.");
            }
        } else {
            console.error("No candidates in AI response or empty response:", result.response);
            throw new Error("AI did not return a usable response candidate.");
        }

    } catch (error) {
        console.error("Error calling Gemini API or processing response:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: `Failed to generate recipe: ${error.message}` }),
        };
    }
};
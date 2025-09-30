// functions/generate-recipe-chat.js
console.log("generate-recipe-chat.js: Top of file, loading modules."); // LOG 1

const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
console.log("generate-recipe-chat.js: GoogleGenerativeAI module loaded."); // LOG 2

const MODEL_NAME = "gemini-1.5-flash-latest";
const API_KEY = process.env.GOOGLE_GEMINI_API_KEY;
console.log("generate-recipe-chat.js: API_KEY defined?", !!API_KEY); // LOG 3

const ALLOWED_ORIGIN = "https://erinslist.netlify.app"; // Your Netlify app's domain
console.log("generate-recipe-chat.js: ALLOWED_ORIGIN defined."); // LOG 4

exports.handler = async (event) => {
    console.log("generate-recipe-chat.js: Handler started. Event HTTP method:", event.httpMethod); // LOG 5
    // For more detailed debugging of the incoming event if needed:
    // console.log("generate-recipe-chat.js: Full event object:", JSON.stringify(event, null, 2));

    const headers = {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };
    console.log("generate-recipe-chat.js: Headers object defined."); // LOG 7

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
    try {
        console.log("generate-recipe-chat.js: Parsing request body.");
        if (!event.body) {
            console.warn("generate-recipe-chat.js: Request body is missing.");
            return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Bad Request: Missing request body.' }) };
        }
        const body = JSON.parse(event.body);
        userPrompt = body.prompt;
        if (!userPrompt || typeof userPrompt !== 'string' || userPrompt.trim() === '') {
            console.warn("generate-recipe-chat.js: Invalid user prompt received.");
            return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Bad Request: "prompt" is required and must be a non-empty string.' }) };
        }
        console.log("generate-recipe-chat.js: User prompt parsed (first 50 chars):", userPrompt.substring(0, 50) + "...");
    } catch (error) {
        console.error("generate-recipe-chat.js: Error parsing request body:", error);
        return { statusCode: 400, headers: headers, body: JSON.stringify({ error: "Bad Request: Invalid JSON in request body." }) };
    }

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

                // Sanitize bare fractions for "quantity" fields
                responseText = responseText.replace(/("quantity":\s*)(\d+\/\d+)(?=\s*[,}])/g, '$1"$2"');
                console.log("generate-recipe-chat.js: responseText after quoting fractions (first 200 chars):", responseText.substring(0, 200) + "...");

                try {
                    const recipeJson = JSON.parse(responseText);
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
                    
                    // Detailed character inspection (optional, but can be uncommented if needed)
                    /*
                    if (responseText && typeof responseText === 'string') {
                        const errorPositionMatch = parseError.message.match(/position\s+(\d+)/);
                        const allegedErrorPosition = errorPositionMatch ? parseInt(errorPositionMatch[1], 10) : -1;
                        if (allegedErrorPosition !== -1) {
                            const contextChars = 25;
                            let debugString = `\n--- Character Details Around Position ${allegedErrorPosition} ---\n`;
                            const startIndex = Math.max(0, allegedErrorPosition - contextChars);
                            const endIndex = Math.min(responseText.length, allegedErrorPosition + contextChars + 1);
                            debugString += `Segment: ...${responseText.substring(startIndex, endIndex)}...\n`;
                            for (let i = startIndex; i < endIndex; i++) {
                                const char = responseText[i]; const charCode = responseText.charCodeAt(i);
                                const highlight = (i === allegedErrorPosition) ? " <--- ERROR HERE" : "";
                                debugString += `Pos: ${i}, Char: '${char.replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t")}' (Code: ${charCode})${highlight}\n`;
                            }
                            console.error(debugString);
                        }
                    }
                    */
                    
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
                console.error("generate-recipe-chat.js: AI response candidate has no content parts:", candidate);
                return { statusCode: 500, headers: headers, body: JSON.stringify({ error: "AI response candidate has no content parts." }) };
            }
        } else {
            const errorMessage = "AI did not return a usable response candidate.";
            console.error("generate-recipe-chat.js:", errorMessage, result.response);
            return { statusCode: 500, headers: headers, body: JSON.stringify({ error: errorMessage, details: result.response }) };
        }
    } catch (error) { // Outermost catch
        const errorMessage = error && error.message ? error.message : "Unknown error during API call or response processing.";
        const errorStack = error && error.stack ? error.stack : "No stack available.";
        console.error("generate-recipe-chat.js: Error calling Gemini API or processing response (outer catch):", { message: errorMessage, stack: errorStack, errorObject: error });
        return { statusCode: 500, headers: headers, body: JSON.stringify({ error: `Failed to generate recipe: ${errorMessage}` }) };
    }
};

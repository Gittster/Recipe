// functions/ask-about-recipe.js
console.log("ask-about-recipe.js: Top of file, loading modules.");

const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
console.log("ask-about-recipe.js: GoogleGenerativeAI module loaded.");

const MODEL_NAME = "gemini-1.5-flash-latest"; // Or your preferred Gemini model
const API_KEY = process.env.GOOGLE_GEMINI_API_KEY;
console.log("ask-about-recipe.js: API_KEY defined?", !!API_KEY);

// IMPORTANT: Set your actual Netlify URL or "*" for local dev
const ALLOWED_ORIGIN = process.env.NETLIFY_URL || "https://your-app-name.netlify.app";
console.log("ask-about-recipe.js: ALLOWED_ORIGIN set to:", ALLOWED_ORIGIN);

exports.handler = async (event) => {
    console.log("ask-about-recipe.js: Handler started. Event HTTP method:", event.httpMethod);

    const headers = {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    if (event.httpMethod === 'OPTIONS') {
        console.log("ask-about-recipe.js: Handling OPTIONS request.");
        return { statusCode: 204, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        console.log("ask-about-recipe.js: Incorrect HTTP method.");
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed. Please use POST.' }) };
    }

    if (!API_KEY) {
        console.error("ask-about-recipe.js: Missing Google Gemini API Key!");
        return { statusCode: 500, headers, body: JSON.stringify({ error: "Server configuration error: Missing API Key." }) };
    }

    let recipeContext;
    let userQuestion;
    let conversationHistory = []; // Default to empty array

    try {
        console.log("ask-about-recipe.js: Parsing request body.");
        if (!event.body) throw new Error("Request body is missing.");
        
        const body = JSON.parse(event.body);
        recipeContext = body.recipeContext;
        userQuestion = body.question;
        if (body.history && Array.isArray(body.history)) {
            conversationHistory = body.history;
        }

        if (!recipeContext || typeof recipeContext !== 'object' || !recipeContext.name) {
            throw new Error("'recipeContext' (with at least a name) is required.");
        }
        if (!userQuestion || typeof userQuestion !== 'string' || userQuestion.trim() === '') {
            throw new Error("'question' is required and must be a non-empty string.");
        }
        console.log("ask-about-recipe.js: Received question:", `"${userQuestion}"`, "for recipe:", `"${recipeContext.name}"`, "History length:", conversationHistory.length);
    } catch (error) {
        console.error("ask-about-recipe.js: Error parsing request body:", error);
        return { statusCode: 400, headers, body: JSON.stringify({ error: `Bad Request: ${error.message}` }) };
    }

    console.log("ask-about-recipe.js: Initializing Gemini AI with model:", MODEL_NAME);
    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    // Prepare a concise recipe context string
    let recipeContextString = "No specific recipe context provided for this question.";
    if (recipeContext) {
        const ingredientsString = recipeContext.ingredients ? recipeContext.ingredients.map(i => `${i.quantity || ''} ${i.unit || ''} ${i.name || 'Unknown ingredient'}`.trim()).join('; ') : 'Not specified';
        const instructionsSummary = recipeContext.instructions ? recipeContext.instructions.substring(0, 700) + (recipeContext.instructions.length > 700 ? "..." : "") : 'Not specified';
        recipeContextString = `
            Current Recipe Context:
            Name: ${recipeContext.name}
            Ingredients: ${ingredientsString || 'None listed'}
            Instructions (summary): ${instructionsSummary || 'None listed'}
            Tags: ${recipeContext.tags ? recipeContext.tags.join(', ') : 'None'}
        `.trim().replace(/\s+/g, ' '); // Compact the string
    }
    
    // Construct the history for the API call (Gemini format)
    const apiHistory = conversationHistory.map(turn => ({
        role: turn.role, // Should be 'user' or 'model' sent from client
        parts: [{ text: turn.text }]
    }));

    // Construct the current user's turn/prompt
    const currentUserTurnPrompt = `
        You are "Chef Bot," an AI culinary assistant.
        ${recipeContextString}
        
        PREVIOUS CONVERSATION (if any, for context):
        ${apiHistory.map(h => `${h.role}: ${h.parts[0].text}`).join('\n')}

        CURRENT USER QUESTION about the recipe context above: "${userQuestion}"

        YOUR TASK:
        1. Answer the user's question directly and concisely in relation to the provided recipe context and conversation history.
        2. If the question implies a modification to the recipe (e.g., substitutions, making it gluten-free, changing serving size, adding/removing an ingredient, altering a step), your response should:
           a. Provide the textual answer to their question, explaining the change.
           b. ALSO, if a modification is feasible, provide a "suggestedUpdate" JSON object. This object should ONLY contain the fields of the recipe that would change (e.g., "name", "ingredients", "instructions", "tags").
              - For "ingredients", provide the complete new list of ingredient objects: [{ "name": "...", "quantity": "...", "unit": "..." }, ...].
              - For "instructions", provide the complete new string of instructions.
              - For "tags", provide the complete new array of tags.
        3. If no recipe modification is implied or feasible based on the question, the "suggestedUpdate" field in your JSON response must be null.

        OUTPUT FORMAT:
        Return ONLY a single valid JSON object with NO surrounding text or markdown. The JSON object must have these exact keys:
        {
          "answer": "Your textual answer to the user's question.",
          "suggestedUpdate": null OR { 
            "name": "(Optional) New recipe name if changed",
            "ingredients": [ (Optional) New full list of ingredient objects if changed ],
            "instructions": "(Optional) New full instructions string if changed",
            "tags": [ (Optional) New full list of tags if changed ]
          }
        }

        Example for a modification:
        User Question: "Can I make this with chicken instead of beef?"
        Expected AI JSON Response:
        {
          "answer": "Yes, you can substitute chicken for beef. You might want to use chicken thighs for better flavor and reduce the initial browning time slightly. I've updated the ingredient list and instructions for you.",
          "suggestedUpdate": {
            "name": "Chicken Stew (modified from Beef Stew)",
            "ingredients": [ { "name": "Chicken Thighs, cubed", "quantity": "1", "unit": "pound" }, /* ... other ingredients ... */ ],
            "instructions": "1. Brown the chicken pieces lightly. 2. ... (modified instructions) ...",
            "tags": ["stew", "chicken", "comfort food"] 
          }
        }

        Example for a general question:
        User Question: "What's a good side dish for this?"
        Expected AI JSON Response:
        {
          "answer": "A simple green salad with a light vinaigrette or some garlic bread would go wonderfully with this recipe!",
          "suggestedUpdate": null
        }

        If the question is unrelated to the recipe or cooking, politely state that you can only help with recipe-related queries and set suggestedUpdate to null.
        Ensure your entire output is a single, valid JSON object.
    `;
    
    // The full content to send, with history first, then the current user prompt
    const contentsForApi = [...apiHistory, { role: "user", parts: [{ text: currentUserTurnPrompt }] }];
    
    const generationConfig = { temperature: 0.5, maxOutputTokens: 2048 }; // Slightly lower temp for more focused answers
    const safetySettings = [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ];

    console.log("ask-about-recipe.js: Attempting to generate content with Gemini.");
    try {
        const result = await model.generateContent({
            contents: contentsForApi,
            generationConfig,
            safetySettings
        });
        console.log("ask-about-recipe.js: Received response from Gemini.");

        const response = result.response;
        if (response && response.candidates && response.candidates.length > 0) {
            const candidate = response.candidates[0];
            // Log safety ratings if present and not PASS
            if (candidate.safetyRatings && candidate.safetyRatings.some(rating => rating.probability !== 'NEGLIGIBLE' && rating.blocked !== false )) { // Check for non-negligible or blocked
                console.warn("ask-about-recipe.js: Potential safety issue in response:", JSON.stringify(candidate.safetyRatings));
            }
            if (candidate.finishReason && candidate.finishReason !== 'STOP' && candidate.finishReason !== 'MAX_TOKENS') {
                console.warn("ask-about-recipe.js: Gemini generation stopped for reason:", candidate.finishReason);
                // Potentially return an error if content is blocked or unusable
                if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'RECITATION' || candidate.finishReason === 'OTHER') {
                     return { statusCode: 500, headers, body: JSON.stringify({ error: `AI response generation issue: ${candidate.finishReason}. Try rephrasing.`, answer: "I'm sorry, I couldn't fully process that request due to content restrictions. Please try rephrasing.", suggestedUpdate: null }) };
                }
            }


            if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
                let responseText = candidate.content.parts[0].text;
                console.log("ask-about-recipe.js: Raw responseText:", responseText.substring(0, 300) + "...");
                
                responseText = responseText.replace(/^```json\s*/im, '').replace(/\s*```$/im, '').trim();
                console.log("ask-about-recipe.js: Cleaned responseText:", responseText.substring(0, 300) + "...");

                try {
                    const aiResponseJson = JSON.parse(responseText);
                    console.log("ask-about-recipe.js: Successfully parsed AI JSON response.");
                    if (typeof aiResponseJson.answer === 'string') { // Main check
                        // Ensure suggestedUpdate is null if not an object
                        if (aiResponseJson.suggestedUpdate !== null && typeof aiResponseJson.suggestedUpdate !== 'object') {
                            aiResponseJson.suggestedUpdate = null;
                        }
                        return { statusCode: 200, headers, body: JSON.stringify(aiResponseJson) };
                    } else {
                        console.error("ask-about-recipe.js: AI JSON response missing 'answer' field or not a string:", aiResponseJson);
                        throw new Error("AI response did not match expected structure (missing 'answer' string).");
                    }
                } catch (parseError) {
                    console.error("ask-about-recipe.js: Error parsing AI response as JSON (inner catch):", parseError, "\nRaw response:", responseText);
                    return { statusCode: 500, headers, body: JSON.stringify({ error: "AI response was not valid JSON.", rawResponse: responseText, parseErrorMessage: parseError.message }) };
                }
            } else {
                console.error("ask-about-recipe.js: AI response candidate has no text content parts:", JSON.stringify(candidate, null, 2));
                return { statusCode: 500, headers, body: JSON.stringify({ error: "AI response candidate had no text content.", answer: "I'm sorry, I couldn't formulate a proper response.", suggestedUpdate: null }) };
            }
        } else {
            const errorMessage = "AI did not return any usable response candidates, or the response was empty.";
            console.error("ask-about-recipe.js:", errorMessage, JSON.stringify(response, null, 2)); // Log the whole API response
            return { statusCode: 500, headers, body: JSON.stringify({ error: errorMessage, answer: "I'm sorry, I wasn't able to process your request.", suggestedUpdate: null }) };
        }
    } catch (error) {
        const errorMessage = error && error.message ? error.message : "Unknown error during API call or response processing.";
        console.error("ask-about-recipe.js: Error calling Gemini API or processing response (outer catch):", { message: errorMessage, stack: error.stack, errorObjectString: JSON.stringify(error, Object.getOwnPropertyNames(error)) });
        return { statusCode: 500, headers, body: JSON.stringify({ error: `Failed to get response from Chef Bot: ${errorMessage}`, answer: `I encountered an issue: ${errorMessage}`, suggestedUpdate: null }) };
    }
};
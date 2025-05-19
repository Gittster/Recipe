// functions/ask-about-recipe.js
console.log("ask-about-recipe.js: Top of file, loading modules.");

const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
console.log("ask-about-recipe.js: GoogleGenerativeAI module loaded.");

const MODEL_NAME = "gemini-1.5-flash-latest"; // Or your preferred Gemini model
const API_KEY = process.env.GOOGLE_GEMINI_API_KEY; // Ensure this is set in Netlify
console.log("ask-about-recipe.js: API_KEY defined?", !!API_KEY);

const ALLOWED_ORIGIN = process.env.NETLIFY_URL || "*"; // Use your site's URL in production, or "*" for dev
console.log("ask-about-recipe.js: ALLOWED_ORIGIN set to:", ALLOWED_ORIGIN);

exports.handler = async (event) => {
    console.log("ask-about-recipe.js: Handler started.");

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

    try {
        console.log("ask-about-recipe.js: Parsing request body.");
        if (!event.body) throw new Error("Request body is missing.");
        
        const body = JSON.parse(event.body);
        recipeContext = body.recipeContext;
        userQuestion = body.question;

        if (!recipeContext || typeof recipeContext !== 'object' || !recipeContext.name) {
            throw new Error("'recipeContext' (with at least a name) is required.");
        }
        if (!userQuestion || typeof userQuestion !== 'string' || userQuestion.trim() === '') {
            throw new Error("'question' is required and must be a non-empty string.");
        }
        console.log("ask-about-recipe.js: Received question:", userQuestion, "for recipe:", recipeContext.name);
    } catch (error) {
        console.error("ask-about-recipe.js: Error parsing request body:", error);
        return { statusCode: 400, headers, body: JSON.stringify({ error: `Bad Request: ${error.message}` }) };
    }

    console.log("ask-about-recipe.js: Initializing Gemini AI with model:", MODEL_NAME);
    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    // Prepare a summary of the recipe context for the prompt
    // This avoids sending overly verbose or potentially huge instruction sets if not needed for the question.
    // For simple questions, name and ingredients might be enough.
    // For modification questions, more detail is needed.
    // The prompt will guide Gemini on how to use this context.
    const recipeContextString = `
        Recipe Name: ${recipeContext.name}
        Ingredients: ${recipeContext.ingredients ? recipeContext.ingredients.map(i => `${i.quantity || ''} ${i.unit || ''} ${i.name}`).join(', ') : 'Not specified'}
        Instructions: ${recipeContext.instructions ? recipeContext.instructions.substring(0, 1000) + (recipeContext.instructions.length > 1000 ? "..." : "") : 'Not specified'}
        Tags: ${recipeContext.tags ? recipeContext.tags.join(', ') : 'Not specified'}
    `.trim();


    const fullPrompt = `
        You are "Chef Bot," an AI culinary assistant. The user is asking a question about a specific recipe they are viewing.
        
        Recipe Context:
        ---
        ${recipeContextString}
        ---

        User's Question: "${userQuestion}"

        Your Task:
        1. Answer the user's question directly and concisely in relation to the provided recipe context.
        2. If the question implies a modification to the recipe (e.g., substitutions, making it gluten-free, changing serving size, adding/removing an ingredient, altering a step), your response should:
           a. Provide the textual answer to their question.
           b. ALSO, if a modification is feasible, provide a "suggestedUpdate" JSON object. This object should ONLY contain the fields of the recipe that would change (e.g., "name", "ingredients", "instructions", "tags"). 
              - For "ingredients", provide the complete new list of ingredient objects: [{ "name": "...", "quantity": "...", "unit": "..." }, ...].
              - For "instructions", provide the complete new string of instructions.
              - For "tags", provide the complete new array of tags.
        3. If no recipe modification is implied or feasible based on the question, the "suggestedUpdate" field should be null or omitted.

        Output Format:
        Return ONLY a single valid JSON object with the following structure:
        {
          "answer": "Your textual answer to the user's question.",
          "suggestedUpdate": { 
            "name": "(Optional) New recipe name if changed",
            "ingredients": [ (Optional) New full list of ingredient objects if changed ],
            "instructions": "(Optional) New full instructions string if changed",
            "tags": [ (Optional) New full list of tags if changed ]
          } OR null 
        }

        Example for a modification:
        User Question: "Can I make this with chicken instead of beef?"
        Recipe Context: (Beef Stew recipe)
        Expected AI JSON Response:
        {
          "answer": "Yes, you can substitute chicken for beef. You might want to use chicken thighs for better flavor and reduce the initial browning time slightly. I've updated the ingredient list and instructions for you.",
          "suggestedUpdate": {
            "name": "Chicken Stew (modified from Beef Stew)",
            "ingredients": [ { "name": "Chicken Thighs, cubed", "quantity": "1", "unit": "pound" }, ... (rest of ingredients, possibly adjusted) ],
            "instructions": "1. Brown the chicken pieces lightly. 2. ... (modified instructions) ...",
            "tags": ["stew", "chicken", "comfort food"] 
          }
        }

        Example for a general question:
        User Question: "What's a good side dish for this?"
        Recipe Context: (Spaghetti Carbonara)
        Expected AI JSON Response:
        {
          "answer": "A simple green salad with a light vinaigrette or some garlic bread would go wonderfully with Spaghetti Carbonara!",
          "suggestedUpdate": null
        }

        Be helpful and provide accurate culinary advice. If the question is unrelated to the recipe or cooking, politely state that you can only help with recipe-related queries.
        Ensure the JSON output is strict and complete.
    `;

    const generationConfig = {
        temperature: 0.6, // Slightly less creative for factual answers/modifications
        topK: 1,
        topP: 1,
        maxOutputTokens: 2048, // Adjust if needed for longer answers/recipe updates
        // responseMimeType: "application/json", // Enable this if the model and SDK version support direct JSON output mode
    };
    const safetySettings = [ /* ... (your existing safetySettings) ... */ ];

    console.log("ask-about-recipe.js: Attempting to generate content with Gemini using recipe context and question.");
    try {
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: fullPrompt }] }]
            // Note: This function currently doesn't send an image, only text context.
            // If the image itself was relevant to the question, you'd need to pass it similar to process-recipe-image.
        });
        console.log("ask-about-recipe.js: Received response from Gemini.");

        const response = result.response;
        if (response && response.candidates && response.candidates.length > 0) {
            const candidate = response.candidates[0];
            if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
                let responseText = candidate.content.parts[0].text;
                console.log("ask-about-recipe.js: Raw responseText:", responseText.substring(0, 300) + "...");
                
                responseText = responseText.replace(/^```json\s*/im, '').replace(/\s*```$/im, '').trim();
                console.log("ask-about-recipe.js: Cleaned responseText:", responseText.substring(0, 300) + "...");

                // No need to quote fractions here as the output is expected JSON from the AI.
                // If AI outputs bare fractions within its JSON string values (which it shouldn't if it follows the prompt),
                // then parsing will fail, and the prompt needs refinement.

                try {
                    const aiResponseJson = JSON.parse(responseText);
                    console.log("ask-about-recipe.js: Successfully parsed AI JSON response.");
                    // Basic validation of the expected structure
                    if (typeof aiResponseJson.answer === 'string') {
                        return { statusCode: 200, headers, body: JSON.stringify(aiResponseJson) };
                    } else {
                        console.error("ask-about-recipe.js: AI JSON response missing 'answer' field:", aiResponseJson);
                        throw new Error("AI response did not match expected structure (missing 'answer').");
                    }
                } catch (parseError) {
                    console.error("ask-about-recipe.js: Error parsing AI response as JSON (inner catch):", parseError, "\nRaw response:", responseText);
                    return { statusCode: 500, headers, body: JSON.stringify({ error: "AI response was not valid JSON.", rawResponse: responseText, parseErrorMessage: parseError.message }) };
                }
            } else { /* ... handle no content parts ... */ }
        } else { /* ... handle no candidates ... */ }
    } catch (error) { /* ... handle outer catch ... */ }
    
    // Fallback error if logic above doesn't return
    console.error("ask-about-recipe.js: Reached end of function unexpectedly or unhandled error.");
    return { statusCode: 500, headers, body: JSON.stringify({ error: "An unexpected error occurred processing your request." }) };
};
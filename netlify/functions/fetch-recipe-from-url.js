const { GoogleGenerativeAI } = require("@google/generative-ai");

const MODEL_NAME = "gemini-2.5-flash";
const API_KEY = process.env.GOOGLE_GEMINI_API_KEY;
const ALLOWED_ORIGIN = process.env.CONTEXT === 'dev' ? '*' : "https://erinslist.netlify.app";

exports.handler = async (event) => {
    const headers = {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    if (!API_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: "Server configuration error: Missing API Key." }) };

    let url;
    try {
        const body = JSON.parse(event.body);
        url = (body.url || '').trim();
        if (!url) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Bad Request: "url" is required.' }) };
        }
        // Validate URL
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Bad Request: URL must use http or https.' }) };
        }
    } catch (error) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Bad Request: Invalid URL or JSON body." }) };
    }

    // --- Fetch the page ---
    let html;
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
            },
            redirect: 'follow',
            signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: `Could not load that page (HTTP ${response.status}). Make sure the URL is correct and publicly accessible.` }) };
        }
        html = await response.text();
    } catch (error) {
        const msg = error.name === 'TimeoutError'
            ? 'The page took too long to load. Try again or use a different URL.'
            : `Could not reach the page: ${error.message}`;
        return { statusCode: 400, headers, body: JSON.stringify({ error: msg }) };
    }

    // --- Try JSON-LD structured data first (used by AllRecipes, Food Network, NYT Cooking, etc.) ---
    const jsonLdRecipe = extractJsonLdRecipe(html);
    if (jsonLdRecipe) {
        const normalized = normalizeJsonLdRecipe(jsonLdRecipe);
        if (normalized) {
            return { statusCode: 200, headers, body: JSON.stringify(normalized) };
        }
    }

    // --- Fall back to plain text + Gemini ---
    const pageText = extractTextFromHtml(html);
    if (!pageText || pageText.trim().length < 100) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Couldn't extract readable content from this page. The site may block automated access." }) };
    }

    // Truncate to avoid hitting token limits (~15k chars is plenty for a recipe)
    const truncatedText = pageText.length > 15000 ? pageText.substring(0, 15000) + '\n...' : pageText;

    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

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
                console.warn(`fetch-recipe-from-url: Retry ${i + 1}: ${msg}. Backing off ${delay}ms.`);
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }

    const fullPrompt = `
You are a helpful recipe parsing assistant. The following is text extracted from a web page.
Find the recipe in this content and convert it into a structured JSON object.
If there is no recipe, return {"error": "No recipe found on this page."}.

The JSON object must have these keys: "name", "ingredients", "instructions", "tags".
- "name": string — the recipe title.
- "ingredients": array of objects with "name" (string), "quantity" (string), "unit" (string).
- "instructions": JSON array of step strings. Each step MUST begin with a step number like "1." or "1)". Do NOT return a single string with multiple steps.
- "tags": array of relevant lowercase strings based on the recipe content.

Respond ONLY with a valid, minified JSON object. No markdown, no code fences.

Page content:
---
${truncatedText}
---
    `.trim();

    try {
        const result = await retryGenerateContent(model, {
            contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
        });

        if (!result.response?.candidates?.length) {
            throw new Error("AI response format was unexpected.");
        }

        const candidate = result.response.candidates[0];
        if (!candidate.content?.parts?.length) {
            throw new Error("AI returned an empty response.");
        }

        let responseText = candidate.content.parts[0].text.trim();
        // Strip markdown code fences if present
        responseText = responseText.replace(/^```json\s*/im, '').replace(/\s*```$/im, '');

        const recipeJson = JSON.parse(responseText);

        if (recipeJson.error) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: recipeJson.error }) };
        }

        // Normalize instructions
        recipeJson.instructions = normalizeInstructions(recipeJson.instructions);

        return { statusCode: 200, headers, body: JSON.stringify(recipeJson) };

    } catch (error) {
        console.error("fetch-recipe-from-url: Gemini error:", error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: `Failed to parse recipe: ${error.message}` }) };
    }
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Looks for schema.org/Recipe JSON-LD blocks in the HTML.
 * Most major recipe sites (AllRecipes, Food Network, NYT Cooking, etc.) use this.
 */
function extractJsonLdRecipe(html) {
    const scriptRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = scriptRegex.exec(html)) !== null) {
        try {
            const data = JSON.parse(match[1]);
            // Can be a single object or an array
            const items = Array.isArray(data) ? data : (data['@graph'] ? data['@graph'] : [data]);
            for (const item of items) {
                if (item && (item['@type'] === 'Recipe' || (Array.isArray(item['@type']) && item['@type'].includes('Recipe')))) {
                    return item;
                }
            }
        } catch (_) {
            // Malformed JSON-LD — skip
        }
    }
    return null;
}

/**
 * Maps a schema.org/Recipe object to our app's format.
 */
function normalizeJsonLdRecipe(schema) {
    try {
        const name = schema.name || '';
        if (!name) return null;

        // Ingredients
        const rawIngredients = schema.recipeIngredient || [];
        const ingredients = rawIngredients.map(raw => parseIngredientString(String(raw)));

        // Instructions: can be HowToStep array, HowToSection array, or plain strings
        const rawInstructions = schema.recipeInstructions || [];
        const steps = [];
        function extractSteps(items) {
            for (const item of items) {
                if (typeof item === 'string') {
                    steps.push(item.trim());
                } else if (item['@type'] === 'HowToStep') {
                    steps.push((item.text || item.name || '').trim());
                } else if (item['@type'] === 'HowToSection') {
                    extractSteps(item.itemListElement || []);
                }
            }
        }
        if (Array.isArray(rawInstructions)) {
            extractSteps(rawInstructions);
        } else if (typeof rawInstructions === 'string') {
            rawInstructions.split(/\r?\n/).map(s => s.trim()).filter(Boolean).forEach(s => steps.push(s));
        }

        const instructions = steps
            .filter(Boolean)
            .map((s, i) => (/^\d+[\.\)]\s*/.test(s) ? s : `${i + 1}. ${s}`));

        // Tags
        const keywords = schema.keywords || '';
        const categories = schema.recipeCategory || '';
        const cuisine = schema.recipeCuisine || '';
        const rawTags = [
            ...(typeof keywords === 'string' ? keywords.split(/,\s*/) : (Array.isArray(keywords) ? keywords : [])),
            ...(typeof categories === 'string' ? [categories] : (Array.isArray(categories) ? categories : [])),
            ...(typeof cuisine === 'string' ? [cuisine] : (Array.isArray(cuisine) ? cuisine : [])),
        ];
        const tags = [...new Set(rawTags.map(t => t.trim().toLowerCase()).filter(Boolean))];

        if (!ingredients.length && !instructions.length) return null;

        return { name, ingredients, instructions, tags };
    } catch (_) {
        return null;
    }
}

/**
 * Simple heuristic to parse "2 cups flour" → { quantity: "2", unit: "cups", name: "flour" }
 */
function parseIngredientString(str) {
    const clean = str.trim();
    // Match optional leading number/fraction, optional unit, rest is name
    const match = clean.match(/^([\d\s¼-¾⅐-⅞\/\-\.]+)?\s*([a-zA-Z]+\.?)?\s+(.+)$/);
    if (match) {
        return {
            quantity: (match[1] || '').trim(),
            unit: (match[2] || '').trim(),
            name: (match[3] || clean).trim(),
        };
    }
    return { quantity: '', unit: '', name: clean };
}

/**
 * Strips HTML tags and cleans up whitespace to get readable page text.
 */
function extractTextFromHtml(html) {
    return html
        // Remove unwanted sections
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
        .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ')
        .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, ' ')
        .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ')
        .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, ' ')
        // Block elements → newlines
        .replace(/<\/?(p|div|li|h[1-6]|br|tr|td|th)[^>]*>/gi, '\n')
        // Strip all remaining tags
        .replace(/<[^>]+>/g, ' ')
        // Decode common HTML entities
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
        .replace(/&#\d+;/g, ' ')
        // Clean whitespace
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * Normalizes instructions into a numbered string array.
 */
function normalizeInstructions(raw) {
    if (typeof raw === 'string') {
        return raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
            .map((s, i) => /^\d+[\.\)]\s*/.test(s) ? s : `${i + 1}. ${s}`);
    }
    if (Array.isArray(raw)) {
        return raw.map((s, i) => {
            const str = String(s).trim();
            return /^\d+[\.\)]\s*/.test(str) ? str : `${i + 1}. ${str}`;
        }).filter(Boolean);
    }
    return [];
}

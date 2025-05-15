// functions/lookup-barcode.js
// Using global fetch available in modern Node.js runtimes on Netlify.
// If you were on an older Node version, you might need: const fetch = require('node-fetch');

// Define your allowed origin for CORS.
// For local testing: "http://127.0.0.1:5500" or your specific local dev port.
// For deployed Netlify site: "https://your-netlify-site-name.netlify.app"
// Using "*" is okay for development but be more specific for production if possible.
const ALLOWED_ORIGIN = "*"; // Or your specific Netlify/dev domain

exports.handler = async (event) => {
    const headers = {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, OPTIONS", // Allow GET for this function
        "Content-Type": "application/json"
    };

    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 204, // No Content
            headers: headers,
            body: ''
        };
    }

    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers: headers,
            body: JSON.stringify({ error: "Method Not Allowed. Please use GET." })
        };
    }

    const barcode = event.queryStringParameters.barcode;

    if (!barcode || barcode.trim() === "") {
        return {
            statusCode: 400,
            headers: headers,
            body: JSON.stringify({ error: "Barcode parameter is required." })
        };
    }

    const apiUrl = `https://world.openfoodfacts.org/api/v2/product/${barcode.trim()}.json`;
    // Using v2 API as it's often more current/stable. You can also try v0 or v3.
    // Adding user agent is good practice for Open Food Facts.
    const fetchOptions = {
        method: 'GET',
        headers: {
            'User-Agent': 'RecipeApp/1.0 (YourAppName; YourContactWebsiteOrEmailIfPublic)' // Be a good API citizen
        }
    };

    console.log(`Netlify Function: Looking up barcode: ${barcode} at URL: ${apiUrl}`);

    try {
        const response = await fetch(apiUrl, fetchOptions);
        const data = await response.json();

        if (!response.ok) {
            // This handles network errors or non-2xx responses before Open Food Facts specific status
            console.error(`Netlify Function: API HTTP error for barcode ${barcode}: ${response.status}`, data);
            return {
                statusCode: response.status,
                headers: headers,
                body: JSON.stringify({ error: `Failed to fetch product data (HTTP ${response.status}).`, details: data.status_verbose || "API error" })
            };
        }

        if (data.status === 0 || !data.product) { // Open Food Facts specific: status 0 means product not found
            console.log(`Netlify Function: Product not found or API error for barcode: ${barcode}`, data);
            return {
                statusCode: 404,
                headers: headers,
                body: JSON.stringify({ error: "Product not found for this barcode.", barcode: barcode, details: data.status_verbose || "Not found" })
            };
        }
        
        // Product found!
        console.log(`Netlify Function: Product found for barcode ${barcode}:`, data.product.product_name || "Unnamed Product");
        return {
            statusCode: 200,
            headers: headers,
            body: JSON.stringify(data) // Send the full product data from Open Food Facts
        };

    } catch (error) {
        console.error(`Netlify Function: Barcode lookup critical error for ${barcode}:`, error);
        return {
            statusCode: 500,
            headers: headers,
            body: JSON.stringify({ error: "Internal server error during barcode lookup.", details: error.message })
        };
    }
};
// functions/upload-recipe-image.js
const cloudinary = require('cloudinary').v2;

const ALLOWED_ORIGIN = process.env.CONTEXT === 'dev' ? '*' : "https://erinslist.netlify.app";

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

exports.handler = async (event) => {
    const headers = {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
        "Content-Type": "application/json"
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    // Handle DELETE request for removing images
    if (event.httpMethod === 'DELETE') {
        try {
            const body = JSON.parse(event.body);
            const { publicId } = body;

            if (!publicId) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'publicId is required' }) };
            }

            const result = await cloudinary.uploader.destroy(publicId);
            return { statusCode: 200, headers, body: JSON.stringify({ success: true, result }) };
        } catch (error) {
            console.error('Error deleting image:', error);
            return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to delete image' }) };
        }
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    // Validate Cloudinary config
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
        console.error('Missing Cloudinary configuration');
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server configuration error' }) };
    }

    try {
        const body = JSON.parse(event.body);
        const { image, mimeType, recipeId, userId } = body;

        if (!image || !mimeType) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'image and mimeType are required' }) };
        }

        if (!userId) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'userId is required (must be logged in)' }) };
        }

        // Create data URI for Cloudinary upload
        const dataUri = `data:${mimeType};base64,${image}`;

        // Upload to Cloudinary with transformations for optimization
        const uploadResult = await cloudinary.uploader.upload(dataUri, {
            folder: `recipes/${userId}`,
            public_id: recipeId || `recipe_${Date.now()}`,
            overwrite: true,
            transformation: [
                { width: 800, height: 800, crop: 'limit' }, // Max dimensions
                { quality: 'auto:good' }, // Auto quality optimization
                { fetch_format: 'auto' } // Auto format (webp when supported)
            ]
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                imageUrl: uploadResult.secure_url,
                publicId: uploadResult.public_id,
                width: uploadResult.width,
                height: uploadResult.height
            })
        };

    } catch (error) {
        console.error('Error uploading to Cloudinary:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to upload image', details: error.message })
        };
    }
};

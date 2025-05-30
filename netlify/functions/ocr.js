const fetch = (...args) =>
    import('node-fetch').then(({ default: fetch }) => fetch(...args));
  
  exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "POST, OPTIONS"
        },
        body: ''
      };
    }
  
    try {
      const { base64 } = JSON.parse(event.body);
      const imageDataUrl = `data:image/png;base64,${base64}`;
  
      const hfResponse = await fetch("https://api-inference.huggingface.co/models/microsoft/trocr-base-handwritten", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.HF_API_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ inputs: imageDataUrl })
      });
  
      const contentType = hfResponse.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const errorText = await hfResponse.text();
        throw new Error("Invalid response: " + errorText);
      }
  
      const result = await hfResponse.json();
  
      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type"
        },
        body: JSON.stringify(result)
      };
    } catch (error) {
      console.error("❌ OCR Function Error:", error.message || error);
      return {
        statusCode: 500,
        headers: {
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify({ error: error.message || "Unknown error" })
      };
    }
  };
  
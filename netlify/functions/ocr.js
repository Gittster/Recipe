const fetch = require("node-fetch");

exports.handler = async function (event) {
  // CORS preflight
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

  const { base64 } = JSON.parse(event.body);

  const response = await fetch("https://api-inference.huggingface.co/models/mindee/doctr-end-to-end", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.HF_API_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      inputs: {
        image: base64
      }
    })
  });

  const result = await response.json();

  return {
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Origin": "*", // You can restrict this to your site URL
      "Access-Control-Allow-Headers": "Content-Type"
    },
    body: JSON.stringify(result)
  };
};

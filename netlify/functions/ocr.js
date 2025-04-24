const fetch = require("node-fetch");

exports.handler = async function (event) {
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
    body: JSON.stringify(result)
  };
};

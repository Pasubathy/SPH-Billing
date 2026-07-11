const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function testModels() {
    if (!process.env.GEMINI_API_KEY) {
        console.error("GEMINI_API_KEY is missing in .env");
        return;
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const models = [
        "gemini-2.5-flash",
        "gemini-2.5-pro",
        "gemini-2.0-flash",
        "gemini-flash-latest"
    ];

    console.log("Testing Gemini API Key with simple text generation...\n");

    for (const modelName of models) {
        try {
            console.log(`Testing model: ${modelName}...`);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent("Say 'hello world'");
            console.log(`  -> SUCCESS! Output: ${result.response.text()}`);
            break; // Stop on first success
        } catch (error) {
            console.error(`  -> FAILED: [${error.name}] ${error.message}`);
        }
    }
}

testModels();

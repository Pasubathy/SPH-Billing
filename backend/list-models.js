const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function listAllModels() {
    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const models = await genAI.getModels();
        console.log("Available Models:", models);
    } catch (e) {
        console.error("Error fetching models:", e.message);
    }
}
listAllModels();

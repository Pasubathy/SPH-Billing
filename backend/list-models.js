const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config({ path: __dirname + '/.env' });

async function listModels() {
    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}&pageSize=100`);
        const data = await response.json();
        const flashModels = data.models.filter(m => m.name.includes('flash')).map(m => m.name);
        console.log("Flash models:", flashModels);
    } catch (e) {
        console.error("Error listing models:", e);
    }
}

listModels();

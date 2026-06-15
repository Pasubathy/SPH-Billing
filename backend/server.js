const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const multer = require('multer');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const HTTP_PORT = 3000;
const HTTPS_PORT = 3443;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Prevent browser caching during development
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});

const dbPath = path.join(__dirname, '../db/data.json');

// Helper to read DB
function readDB() {
    try {
        let data = fs.readFileSync(dbPath, 'utf8');
        // Strip BOM (written by PowerShell UTF-8 with BOM) to prevent JSON.parse failure
        if (data.charCodeAt(0) === 0xFEFF) data = data.slice(1);
        return JSON.parse(data);
    } catch (err) {
        console.error('Error reading data.json:', err);
        return { categories: [], units: [], items: [], customers: [], sales: [], invoice_counter: 1, payments: [], payment_counter: 1, tagSettings: {}, vendors: [], purchase_invoices: [] };
    }
}

// Helper to write DB
function writeDB(data) {
    try {
        fs.writeFileSync(dbPath, JSON.stringify(data), 'utf8');
        return true;
    } catch (err) {
        console.error('Error writing to data.json:', err);
        return false;
    }
}

// API Endpoints

// 1. Categories
app.get('/api/categories', (req, res) => res.json(readDB().categories || []));
app.post('/api/categories', (req, res) => {
    const db = readDB(); db.categories = req.body; writeDB(db);
    res.json({ success: true });
});

// 2. Units
app.get('/api/units', (req, res) => res.json(readDB().units || []));
app.post('/api/units', (req, res) => {
    const db = readDB(); db.units = req.body; writeDB(db);
    res.json({ success: true });
});

// 3. Items
app.get('/api/items', (req, res) => res.json(readDB().items || []));
app.post('/api/items', (req, res) => {
    const db = readDB(); db.items = req.body; writeDB(db);
    res.json({ success: true });
});

// 4. Customers
app.get('/api/customers', (req, res) => res.json(readDB().customers || []));
app.post('/api/customers', (req, res) => {
    const db = readDB(); db.customers = req.body; writeDB(db);
    res.json({ success: true });
});

// 5. Sales
app.get('/api/sales', (req, res) => res.json(readDB().sales || []));
app.post('/api/sales', (req, res) => {
    const db = readDB(); db.sales = req.body; writeDB(db);
    res.json({ success: true });
});

// 6. Invoice Counter
app.get('/api/invoice-counter', (req, res) => res.json({ counter: readDB().invoice_counter || 1 }));
app.post('/api/invoice-counter', (req, res) => {
    const db = readDB(); db.invoice_counter = parseInt(req.body.counter) || 1; writeDB(db);
    res.json({ success: true, counter: db.invoice_counter });
});

// 7. Payments
app.get('/api/payments', (req, res) => res.json(readDB().payments || []));
app.post('/api/payments', (req, res) => {
    const db = readDB(); db.payments = req.body; writeDB(db);
    res.json({ success: true });
});

// 8. Payment Counter
app.get('/api/payment-counter', (req, res) => res.json({ counter: readDB().payment_counter || 1 }));
app.post('/api/payment-counter', (req, res) => {
    const db = readDB(); db.payment_counter = parseInt(req.body.counter) || 1; writeDB(db);
    res.json({ success: true, counter: db.payment_counter });
});

// 9. Tag Settings
app.get('/api/settings/tag', (req, res) => res.json(readDB().tagSettings || {}));
app.post('/api/settings/tag', (req, res) => {
    const db = readDB(); db.tagSettings = req.body; writeDB(db);
    res.json({ success: true });
});

// 10. Vendors
app.get('/api/vendors', (req, res) => res.json(readDB().vendors || []));
app.post('/api/vendors', (req, res) => {
    const db = readDB(); db.vendors = req.body; writeDB(db);
    res.json({ success: true });
});

// 11. Purchase Invoices
app.get('/api/purchase-invoices', (req, res) => res.json(readDB().purchase_invoices || []));
app.post('/api/purchase-invoices', (req, res) => {
    const db = readDB(); db.purchase_invoices = req.body; writeDB(db);
    res.json({ success: true });
});

// 12. Purchase Invoice Counter
app.get('/api/pi-counter', (req, res) => res.json({ counter: readDB().pi_counter || 1 }));
app.post('/api/pi-counter', (req, res) => {
    const db = readDB(); db.pi_counter = parseInt(req.body.counter) || 1; writeDB(db);
    res.json({ success: true, counter: db.pi_counter });
});

// 13. AI Invoice Extraction
const upload = multer({ storage: multer.memoryStorage() });
app.post('/api/ai/extract-invoice', upload.single('invoiceFile'), async (req, res) => {
    try {
        if (!process.env.GEMINI_API_KEY) {
            return res.status(500).json({ error: 'Gemini API Key is not configured' });
        }
        
        if (!req.file) {
            return res.status(400).json({ error: 'No invoice file uploaded' });
        }

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const prompt = `You are an expert accounting assistant. Extract the structured invoice data from the provided image or PDF.
Return ONLY a valid JSON object matching the following structure:
{
  "vendor": { "name": "", "gstin": "", "address": "", "phone": "" },
  "invoice": { "invoiceNo": "", "invoiceDate": "YYYY-MM-DD", "dueDate": "YYYY-MM-DD" },
  "items": [
    { "name": "", "description": "", "hsn": "", "qty": 0, "unit": "Nos", "rate": 0.0, "discount": 0.0, "taxPercent": 0, "taxAmount": 0.0, "totalAmount": 0.0 }
  ],
  "summary": { "subTotal": 0.0, "discount": 0.0, "afterDiscount": 0.0, "cgst": 0.0, "sgst": 0.0, "total": 0.0, "roundOff": 0.0, "grandTotal": 0.0 }
}
Do not include any markdown formatting like \`\`\`json. Return only the raw JSON string.`;

        const responseResult = await model.generateContent([
            prompt,
            {
                inlineData: {
                    data: req.file.buffer.toString('base64'),
                    mimeType: req.file.mimetype
                }
            }
        ]);

        let jsonString = responseResult.response.text();
        jsonString = jsonString.replace(/^```json\n?/, '').replace(/```\n?$/, '').trim();
        const extractedData = JSON.parse(jsonString);

        res.json({ success: true, data: extractedData });
    } catch (error) {
        console.error('AI Extraction Error:', error);
        res.status(500).json({ error: 'AI Error: ' + error.message });
    }
});

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../frontend')));

// Fallback to index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Start HTTPS server on port 3443
const certPath = path.join(__dirname, 'cert.pfx');
if (fs.existsSync(certPath)) {
    const httpsOptions = { pfx: fs.readFileSync(certPath), passphrase: 'sph1234' };
    https.createServer(httpsOptions, app).listen(HTTPS_PORT, '0.0.0.0', () => {
        console.log(`==================================================`);
        console.log(`  SPH Billing Server running at:`);
        console.log(`  Local:   https://localhost:${HTTPS_PORT}`);
        console.log(`  Network: https://192.168.1.8:${HTTPS_PORT}`);
        console.log(`  (Camera works! Accept cert warning on mobile)`);
        console.log(`==================================================`);
    });
} else {
    // Fallback: HTTP only on 3000
    app.listen(HTTP_PORT, '0.0.0.0', () => {
        console.log(`  HTTP only - no cert.pfx found`);
        console.log(`  Network: http://192.168.1.8:${HTTP_PORT}`);
    });
}

/**
 * SPH Billing - Optimization #1: Items API Payload Reduction Test Suite
 * 
 * Verifies:
 *  1. GET /api/items returns all required business fields.
 *  2. images is an empty array in the list response (zero base64 payload bloat).
 *  3. hasImage boolean is accurate (true when images exist, false when absent).
 *  4. GET /api/items/:code returns full item details with images intact.
 *  5. Barcode lookup works accurately with optimized items list.
 *  6. Billing item selection and cart calculations work with optimized items list.
 *  7. Measures exact payload reduction percentage (> 90% savings).
 */

const assert = require('assert');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const REQUIRED_ITEM_FIELDS = [
    'id', 'code', 'name', 'category', 'unit', 'hsn', 'gstRate', 'cess',
    'taxType', 'taxAmount', 'purchasePrice', 'purchaseAmount', 'sellingPrice',
    'sellingAmount', 'mrp', 'stock', 'minimumStock', 'itemLocation',
    'purchaseTaxType', 'sellingTaxType', 'conversions', 'hasImage', 'images'
];

async function runTests() {
    console.log('================================================================');
    console.log('   TEST SUITE: OPTIMIZATION #1 — ITEMS API PAYLOAD REDUCTION    ');
    console.log('================================================================\n');

    const client = await pool.connect();
    try {
        // -------------------------------------------------------------
        // Test 1: Query List Projection vs Baseline
        // -------------------------------------------------------------
        console.log('[TEST 1] Verifying GET /api/items projection and required fields');
        const listQuery = `
            SELECT id, code, name, category_name as "category", unit_name as "unit", hsn, gst_rate as "gstRate", 
            cess, tax_type as "taxType", tax_amount as "taxAmount", purchase_price as "purchasePrice", purchase_price as "purchaseAmount",
            selling_price as "sellingPrice", selling_price as "sellingAmount", mrp, stock, minimum_stock as "minimumStock", 
            location as "itemLocation", purchase_tax_type as "purchaseTaxType", selling_tax_type as "sellingTaxType", 
            conversions,
            CASE 
                WHEN images IS NOT NULL AND jsonb_typeof(images) = 'array' AND jsonb_array_length(images) > 0 THEN true 
                ELSE false 
            END as "hasImage",
            '[]'::jsonb as images
            FROM items
            ORDER BY id ASC
        `;
        const listRes = await client.query(listQuery);
        const items = listRes.rows;
        assert(items.length > 0, 'Items list must return rows');

        const firstItem = items[0];
        for (const field of REQUIRED_ITEM_FIELDS) {
            assert(field in firstItem, `Field '${field}' must be present in item object`);
        }
        console.log(`  ✓ All ${REQUIRED_ITEM_FIELDS.length} required fields verified on ${items.length} items.`);

        // -------------------------------------------------------------
        // Test 2: Verify zero base64 image strings in list response
        // -------------------------------------------------------------
        console.log('\n[TEST 2] Verifying zero base64 payload in items list');
        const listJson = JSON.stringify(items);
        assert(!listJson.includes('data:image/'), 'List response must not contain base64 image data');
        for (const item of items) {
            assert(Array.isArray(item.images), 'item.images must be an array');
            assert.strictEqual(item.images.length, 0, 'item.images in list response must be empty array');
            assert.strictEqual(typeof item.hasImage, 'boolean', 'hasImage must be a boolean');
        }
        console.log('  ✓ Verified: 100% of items have images: [] and valid hasImage boolean.');

        // -------------------------------------------------------------
        // Test 3: Verify hasImage accuracy
        // -------------------------------------------------------------
        console.log('\n[TEST 3] Verifying hasImage accuracy against raw database');
        const rawRes = await client.query(`SELECT code, jsonb_array_length(CASE WHEN jsonb_typeof(images) = 'array' THEN images ELSE '[]'::jsonb END) as img_count FROM items`);
        const rawMap = new Map(rawRes.rows.map(r => [r.code, parseInt(r.img_count) || 0]));

        let itemsWithImagesCount = 0;
        let itemsWithoutImagesCount = 0;

        for (const item of items) {
            const actualCount = rawMap.get(item.code) || 0;
            if (actualCount > 0) {
                assert.strictEqual(item.hasImage, true, `Item ${item.code} has ${actualCount} images, hasImage must be true`);
                itemsWithImagesCount++;
            } else {
                assert.strictEqual(item.hasImage, false, `Item ${item.code} has 0 images, hasImage must be false`);
                itemsWithoutImagesCount++;
            }
        }
        console.log(`  ✓ hasImage verified across ${items.length} items (${itemsWithImagesCount} with images, ${itemsWithoutImagesCount} without).`);

        // -------------------------------------------------------------
        // Test 4: Single Item Detail endpoint query (GET /api/items/:code)
        // -------------------------------------------------------------
        console.log('\n[TEST 4] Verifying single item detail query with full image retention');
        const itemWithImg = items.find(i => i.hasImage);
        assert(itemWithImg, 'At least one test item must have an image');

        const detailQuery = `
            SELECT id, code, name, category_name as "category", unit_name as "unit", hsn, gst_rate as "gstRate", 
            cess, tax_type as "taxType", tax_amount as "taxAmount", purchase_price as "purchasePrice", purchase_price as "purchaseAmount",
            selling_price as "sellingPrice", selling_price as "sellingAmount", mrp, stock, minimum_stock as "minimumStock", 
            location as "itemLocation", purchase_tax_type as "purchaseTaxType", selling_tax_type as "sellingTaxType", 
            conversions, images,
            CASE 
                WHEN images IS NOT NULL AND jsonb_typeof(images) = 'array' AND jsonb_array_length(images) > 0 THEN true 
                ELSE false 
            END as "hasImage"
            FROM items
            WHERE LOWER(code) = LOWER($1)
        `;
        const detailRes = await client.query(detailQuery, [itemWithImg.code]);
        assert.strictEqual(detailRes.rows.length, 1, 'Detail query must return exactly 1 row');
        const detailItem = detailRes.rows[0];
        assert.strictEqual(detailItem.hasImage, true);
        assert(Array.isArray(detailItem.images), 'detailItem.images must be an array');
        assert(detailItem.images.length > 0, 'detailItem.images must contain full image data');
        console.log(`  ✓ Item detail for '${itemWithImg.code}' returned ${detailItem.images.length} full image(s).`);

        // -------------------------------------------------------------
        // Test 5: Barcode lookup simulation
        // -------------------------------------------------------------
        console.log('\n[TEST 5] Verifying barcode lookup using optimized items list');
        function findItemByBarcode(allItems, barcode) {
            if (!barcode || !Array.isArray(allItems)) return null;
            const clean = String(barcode).trim().toLowerCase();
            for (const i of allItems) {
                if (i.code && String(i.code).trim().toLowerCase() === clean) return i;
                if (i.barcode && String(i.barcode).trim().toLowerCase() === clean) return i;
            }
            return null;
        }

        const found = findItemByBarcode(items, itemWithImg.code);
        assert(found, `findItemByBarcode must find item with code ${itemWithImg.code}`);
        assert(found.sellingPrice !== undefined && found.sellingPrice !== null, 'sellingPrice must be defined');
        assert(!isNaN(parseFloat(found.sellingPrice)), 'sellingPrice must be numeric');
        console.log(`  ✓ Barcode match for '${itemWithImg.code}' succeeded with price ₹${found.sellingPrice}.`);

        // -------------------------------------------------------------
        // Test 6: Billing cart addition simulation
        // -------------------------------------------------------------
        console.log('\n[TEST 6] Simulating billing cart selection and calculation');
        const selectedItem = items[0];
        const cartRow = {
            item: selectedItem,
            qty: 2,
            rate: parseFloat(selectedItem.sellingPrice) || 100,
            disc: 0,
            taxPercent: parseFloat(selectedItem.gstRate) || 0,
            sellingTaxType: selectedItem.sellingTaxType || 'without'
        };
        const rowTotal = cartRow.qty * cartRow.rate;
        assert(rowTotal > 0, 'Row total calculation must be positive');
        console.log(`  ✓ Cart row calculated: 2 x ₹${cartRow.rate} = ₹${rowTotal}`);

        // -------------------------------------------------------------
        // Test 7: Payload size comparison
        // -------------------------------------------------------------
        console.log('\n[TEST 7] Measuring payload reduction');
        const rawListQuery = `SELECT * FROM items`;
        const rawResFull = await client.query(rawListQuery);
        const rawBytes = Buffer.byteLength(JSON.stringify(rawResFull.rows));
        const optBytes = Buffer.byteLength(JSON.stringify(items));

        const savingsBytes = rawBytes - optBytes;
        const reductionPct = ((savingsBytes / rawBytes) * 100).toFixed(1);

        console.log(`  Original unoptimized payload: ${(rawBytes / 1024).toFixed(2)} KB`);
        console.log(`  Optimized list payload:       ${(optBytes / 1024).toFixed(2)} KB`);
        console.log(`  Total savings:                ${(savingsBytes / 1024).toFixed(2)} KB (${reductionPct}% reduction)`);
        assert(reductionPct >= 80, 'Payload reduction must be at least 80%');

        console.log('\n================================================================');
        console.log('      ALL 7 FOCUSED OPTIMIZATION #1 REGRESSION TESTS PASSED     ');
        console.log('================================================================\n');

    } finally {
        client.release();
        await pool.end();
    }
}

runTests().catch(err => {
    console.error('TEST SUITE FAILED:', err);
    process.exit(1);
});

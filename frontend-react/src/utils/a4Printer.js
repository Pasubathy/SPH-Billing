/**
 * SPH Billing — A4 & Multi-Grid Label Printing Utility
 * Phase 4D Step 5: Native CSS Physical Units (mm), Strict A4 Geometry & Isolated Iframe Printing
 *
 * Requirements:
 * 1. Native CSS physical units (mm) — Zero 3.78px screen pixel scaling.
 * 2. Proper A4 print geometry:
 *    @page { size: A4 portrait; margin: 0; }
 *    .a4-page { width: 210mm; height: 297mm; box-sizing: border-box; }
 * 3. Preserves all user-configurable settings: rows, cols, width, height, margins, gaps.
 * 4. Validation: Confirms grid physically fits within 210mm x 297mm before rendering.
 * 5. Isolated hidden iframe print execution — Zero unmanaged popups (window.open) and no page reloads.
 * 6. Isolated from thermal receipt printing.
 */

export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;

/**
 * Validates that the configured label grid physically fits inside standard A4 dimensions (210mm x 297mm).
 *
 * Horizontal Formula:
 * leftMargin + (columns * labelWidth) + ((columns - 1) * horizontalGap) + rightMargin <= 210mm
 *
 * Vertical Formula:
 * topMargin + (rows * labelHeight) + ((rows - 1) * verticalGap) + bottomMargin <= 297mm
 *
 * @param {Object} settings - Tag settings object from localStorage or state
 * @returns {{ valid: boolean, totalWidth: number, totalHeight: number, error: string | null }}
 */
export function validateA4LabelLayout(settings = {}) {
    const cols = Math.max(1, parseInt(settings.tsA4Cols ?? 4, 10));
    const rows = Math.max(1, parseInt(settings.tsA4Rows ?? 10, 10));
    const labelWidth = Math.max(1, parseFloat(settings.tsWidth ?? 50));
    const labelHeight = Math.max(1, parseFloat(settings.tsHeight ?? 25));

    const leftMargin = Math.max(0, parseFloat(settings.tsA4MarginLeft ?? 10));
    const rightMargin = Math.max(0, parseFloat(settings.tsA4MarginRight ?? 10));
    const topMargin = Math.max(0, parseFloat(settings.tsA4MarginTop ?? 12));
    const bottomMargin = Math.max(0, parseFloat(settings.tsA4MarginBottom ?? 12));

    const hGap = Math.max(0, parseFloat(settings.tsA4HSpace ?? 2));
    const vGap = Math.max(0, parseFloat(settings.tsA4VSpace ?? 2));

    const totalWidth = Number((leftMargin + (cols * labelWidth) + ((cols - 1) * hGap) + rightMargin).toFixed(2));
    const totalHeight = Number((topMargin + (rows * labelHeight) + ((rows - 1) * vGap) + bottomMargin).toFixed(2));

    const errors = [];
    // Allow small epsilon (0.05mm) for decimal floating point precision
    if (totalWidth > A4_WIDTH_MM + 0.05) {
        errors.push(`Horizontal grid width (${totalWidth}mm) exceeds A4 width (${A4_WIDTH_MM}mm) by ${(totalWidth - A4_WIDTH_MM).toFixed(1)}mm [Left: ${leftMargin}mm + ${cols}×${labelWidth}mm + ${cols - 1}×${hGap}mm + Right: ${rightMargin}mm].`);
    }
    if (totalHeight > A4_HEIGHT_MM + 0.05) {
        errors.push(`Vertical grid height (${totalHeight}mm) exceeds A4 height (${A4_HEIGHT_MM}mm) by ${(totalHeight - A4_HEIGHT_MM).toFixed(1)}mm [Top: ${topMargin}mm + ${rows}×${labelHeight}mm + ${rows - 1}×${vGap}mm + Bottom: ${bottomMargin}mm].`);
    }

    if (errors.length > 0) {
        return {
            valid: false,
            totalWidth,
            totalHeight,
            error: errors.join(' ')
        };
    }

    return {
        valid: true,
        totalWidth,
        totalHeight,
        error: null
    };
}

/**
 * Builds standalone HTML for an A4 multi-grid sticker sheet.
 *
 * @param {Object} options
 * @param {Object} options.item - Item data (code, name, price, unit, desc, category)
 * @param {Object} options.settings - User tag settings
 * @param {number} [options.copies=1] - Number of sticker copies to print
 * @param {number} [options.start=1] - Starting sticker cell index (1-based)
 * @returns {string} Fully formatted HTML string
 */
export function buildA4LabelSheetHTML({ item = {}, settings = {}, copies = 1, start = 1 }) {
    const validation = validateA4LabelLayout(settings);
    if (!validation.valid) {
        throw new Error(`A4 Label Layout Error: ${validation.error}`);
    }

    const cols = Math.max(1, parseInt(settings.tsA4Cols ?? 4, 10));
    const rows = Math.max(1, parseInt(settings.tsA4Rows ?? 10, 10));
    const labelWidth = parseFloat(settings.tsWidth ?? 50);
    const labelHeight = parseFloat(settings.tsHeight ?? 25);

    const leftMargin = parseFloat(settings.tsA4MarginLeft ?? 10);
    const rightMargin = parseFloat(settings.tsA4MarginRight ?? 10);
    const topMargin = parseFloat(settings.tsA4MarginTop ?? 12);
    const bottomMargin = parseFloat(settings.tsA4MarginBottom ?? 12);

    const hGap = parseFloat(settings.tsA4HSpace ?? 2);
    const vGap = parseFloat(settings.tsA4VSpace ?? 2);

    // Inner label content padding
    const pTop = parseFloat(settings.tsMarginTop ?? 0);
    const pRight = parseFloat(settings.tsMarginRight ?? 0);
    const pBottom = parseFloat(settings.tsMarginBottom ?? 0);
    const pLeft = parseFloat(settings.tsMarginLeft ?? 0);

    const showCode = settings.tsOptCode !== false;
    const showName = settings.tsOptName !== false;
    const showPrice = settings.tsOptPrice !== false;
    const showQR = settings.tsOptQR !== false;
    const showDesc = Boolean(settings.tsOptDesc);
    const showCat = Boolean(settings.tsOptCat);

    const sizeCode = settings.tsSizeCode || 12;
    const sizeName = settings.tsSizeName || 14;
    const sizePrice = settings.tsSizePrice || 16;
    const sizeQR = settings.tsSizeQR || 35; // % of label width

    const alignText = (settings.tsAlign || 'left').toLowerCase();
    const jContent = alignText === 'center' ? 'center' : (alignText === 'right' ? 'flex-end' : 'flex-start');

    // QR dimensions in mm
    const qrDimMm = Number(((sizeQR / 100) * labelWidth).toFixed(1));
    const qrDataUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(item.code || '1001')}`;

    const numCopies = Math.max(1, parseInt(copies, 10) || 1);
    const startPos = Math.max(1, parseInt(start, 10) || 1);

    const labelsPerPage = rows * cols;
    const totalCells = (startPos - 1) + numCopies;
    const totalPages = Math.ceil(totalCells / labelsPerPage);

    let currentCell = 0;
    let pagesHtml = '';

    for (let p = 0; p < totalPages; p++) {
        let cellsHtml = '';
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                currentCell++;
                if (currentCell < startPos || currentCell >= startPos + numCopies) {
                    // Empty cell placeholder preserving exact grid position
                    cellsHtml += `<div class="label-cell empty-cell" style="width:${labelWidth}mm;height:${labelHeight}mm;"></div>`;
                } else {
                    const priceFormatted = parseFloat(item.sellingPrice || item.price || 0).toFixed(2);
                    const unitSuffix = item.unit ? `/${item.unit}` : '';

                    cellsHtml += `
                    <div class="label-cell filled-cell" style="width:${labelWidth}mm;height:${labelHeight}mm;padding:${pTop}mm ${pRight}mm ${pBottom}mm ${pLeft}mm;">
                        <div class="tag-content" style="justify-content:${jContent};">
                            ${showQR ? `
                            <div class="qr-box" style="width:${qrDimMm}mm;height:${qrDimMm}mm;">
                                <img src="${qrDataUrl}" alt="QR">
                            </div>` : ''}
                            <div class="text-box" style="text-align:${alignText};align-items:${alignText === 'center' ? 'center' : (alignText === 'right' ? 'flex-end' : 'flex-start')};">
                                ${showCode ? `<div class="label-code" style="font-size:${sizeCode}px;">${item.code || ''}</div>` : ''}
                                ${showName ? `<div class="label-name" style="font-size:${sizeName}px;">${item.name || ''}</div>` : ''}
                                ${showDesc && item.desc ? `<div class="label-desc" style="font-size:${Math.max(8, sizeName - 4)}px;">${item.desc}</div>` : ''}
                                ${showCat && item.category ? `<div class="label-cat" style="font-size:${Math.max(8, sizeName - 4)}px;">${item.category}</div>` : ''}
                                ${showPrice ? `<div class="label-price" style="font-size:${sizePrice}px;">₹${priceFormatted}${unitSuffix}</div>` : ''}
                            </div>
                        </div>
                    </div>`;
                }
            }
        }

        pagesHtml += `
        <div class="a4-page">
            <div class="a4-grid" style="
                display: grid;
                grid-template-columns: repeat(${cols}, ${labelWidth}mm);
                grid-template-rows: repeat(${rows}, ${labelHeight}mm);
                column-gap: ${hGap}mm;
                row-gap: ${vGap}mm;
                padding: ${topMargin}mm ${rightMargin}mm ${bottomMargin}mm ${leftMargin}mm;
                width: 210mm;
                height: 297mm;
                box-sizing: border-box;
            ">
                ${cellsHtml}
            </div>
        </div>`;
    }

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Print A4 Labels - ${item.name || 'Labels'}</title>
    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        *, *::before, *::after {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        @page {
            size: A4 portrait;
            margin: 0;
        }
        html, body {
            margin: 0;
            padding: 0;
            background: white !important;
            font-family: 'Manrope', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        .a4-page {
            width: 210mm;
            height: 297mm;
            box-sizing: border-box;
            page-break-after: always;
            break-after: page;
            background: white;
            overflow: hidden;
            margin: 0 auto;
        }
        .a4-page:last-child {
            page-break-after: auto;
            break-after: auto;
        }
        .a4-grid {
            justify-content: start;
            align-content: start;
        }
        .label-cell {
            box-sizing: border-box;
            overflow: hidden;
            display: flex;
            align-items: center;
            background: white;
        }
        .filled-cell {
            border: 1px solid #e2e8f0;
        }
        .empty-cell {
            border: none;
            background: transparent;
        }
        .tag-content {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 2mm;
            overflow: hidden;
        }
        .qr-box {
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .qr-box img {
            width: 100%;
            height: 100%;
            object-fit: contain;
        }
        .text-box {
            display: flex;
            flex-direction: column;
            justify-content: center;
            gap: 1px;
            flex: 1;
            min-width: 0;
            overflow: hidden;
        }
        .label-code, .label-name, .label-price, .label-desc, .label-cat {
            line-height: 1.15;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            color: #000;
        }
        .label-name {
            font-weight: 700;
        }
        .label-code {
            font-weight: 600;
            color: #475569;
        }
        .label-price {
            font-weight: 800;
            color: #000;
        }
    </style>
</head>
<body>
    ${pagesHtml}
</body>
</html>`;
}

/**
 * Builds standalone HTML for thermal roll tag printing.
 * Keeps thermal tag printing isolated from A4 layout.
 *
 * @param {Object} options
 * @param {Object} options.item
 * @param {Object} options.settings
 * @param {number} [options.copies=1]
 * @returns {string}
 */
export function buildThermalTagHTML({ item = {}, settings = {}, copies = 1 }) {
    const width = parseFloat(settings.tsWidth ?? 50);
    const height = parseFloat(settings.tsHeight ?? 25);
    const mt = parseFloat(settings.tsMarginTop ?? 0);
    const mb = parseFloat(settings.tsMarginBottom ?? 0);
    const ml = parseFloat(settings.tsMarginLeft ?? 0);
    const mr = parseFloat(settings.tsMarginRight ?? 0);

    const showCode = settings.tsOptCode !== false;
    const showName = settings.tsOptName !== false;
    const showPrice = settings.tsOptPrice !== false;
    const showQR = settings.tsOptQR !== false;

    const sizeCode = settings.tsSizeCode || 12;
    const sizeName = settings.tsSizeName || 14;
    const sizePrice = settings.tsSizePrice || 16;
    const sizeQR = settings.tsSizeQR || 35;

    const alignText = (settings.tsAlign || 'left').toLowerCase();
    const jContent = alignText === 'center' ? 'center' : (alignText === 'right' ? 'flex-end' : 'flex-start');
    const qrDimMm = Number(((sizeQR / 100) * width).toFixed(1));
    const qrDataUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(item.code || '1001')}`;

    const numCopies = Math.max(1, parseInt(copies, 10) || 1);
    let tagsHtml = '';

    for (let i = 0; i < numCopies; i++) {
        const priceFormatted = parseFloat(item.sellingPrice || item.price || 0).toFixed(2);
        const unitSuffix = item.unit ? `/${item.unit}` : '';

        tagsHtml += `
        <div class="thermal-tag" style="width:${width}mm;height:${height}mm;padding:${mt}mm ${mr}mm ${mb}mm ${ml}mm;">
            <div class="tag-content" style="justify-content:${jContent};">
                ${showQR ? `
                <div class="qr-box" style="width:${qrDimMm}mm;height:${qrDimMm}mm;">
                    <img src="${qrDataUrl}" alt="QR">
                </div>` : ''}
                <div class="text-box" style="text-align:${alignText};align-items:${alignText === 'center' ? 'center' : (alignText === 'right' ? 'flex-end' : 'flex-start')};">
                    ${showCode ? `<div class="label-code" style="font-size:${sizeCode}px;">${item.code || ''}</div>` : ''}
                    ${showName ? `<div class="label-name" style="font-size:${sizeName}px;">${item.name || ''}</div>` : ''}
                    ${showPrice ? `<div class="label-price" style="font-size:${sizePrice}px;">₹${priceFormatted}${unitSuffix}</div>` : ''}
                </div>
            </div>
        </div>`;
    }

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Print Thermal Tag - ${item.name || 'Tag'}</title>
    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        *, *::before, *::after {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        @page {
            size: ${width}mm ${height}mm;
            margin: 0;
        }
        html, body {
            margin: 0;
            padding: 0;
            background: white !important;
            font-family: 'Manrope', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        .thermal-tag {
            box-sizing: border-box;
            overflow: hidden;
            display: flex;
            align-items: center;
            background: white;
            page-break-after: always;
            break-after: page;
            margin: 0 auto;
        }
        .thermal-tag:last-child {
            page-break-after: auto;
            break-after: auto;
        }
        .tag-content {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 2mm;
            overflow: hidden;
        }
        .qr-box {
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .qr-box img {
            width: 100%;
            height: 100%;
            object-fit: contain;
        }
        .text-box {
            display: flex;
            flex-direction: column;
            justify-content: center;
            gap: 1px;
            flex: 1;
            min-width: 0;
            overflow: hidden;
        }
        .label-code, .label-name, .label-price {
            line-height: 1.15;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            color: #000;
        }
        .label-name { font-weight: 700; }
        .label-code { font-weight: 600; color: #475569; }
        .label-price { font-weight: 800; color: #000; }
    </style>
</head>
<body>
    ${tagsHtml}
</body>
</html>`;
}

/**
 * Spawns an isolated hidden iframe, renders the given HTML document, waits for resources,
 * triggers print, and automatically tears down the iframe.
 *
 * @param {string} htmlContent - Full HTML string to print
 * @param {string} [frameTitle='Print Frame'] - Frame title
 * @returns {Promise<void>} Resolves when the print job is handed to the browser
 */
export function executeIsolatedIframePrint(htmlContent, frameTitle = 'Print Frame') {
    return new Promise((resolve) => {
        if (!htmlContent || typeof document === 'undefined') {
            resolve();
            return;
        }

        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.left = '-9999px';
        iframe.style.top = '-9999px';
        iframe.style.width = '100px';
        iframe.style.height = '100px';
        iframe.style.border = 'none';
        iframe.style.opacity = '0';
        iframe.style.pointerEvents = 'none';
        iframe.setAttribute('aria-hidden', 'true');
        iframe.title = frameTitle;

        let isCleanedUp = false;
        const cleanup = () => {
            if (isCleanedUp) return;
            isCleanedUp = true;
            try {
                if (iframe.parentNode) {
                    iframe.parentNode.removeChild(iframe);
                }
            } catch (e) {}
            resolve();
        };

        document.body.appendChild(iframe);

        const iframeWin = iframe.contentWindow;
        if (!iframeWin) {
            cleanup();
            return;
        }

        const triggerPrint = () => {
            try {
                iframeWin.onafterprint = () => {
                    cleanup();
                };
                iframeWin.focus();
                iframeWin.print();
                // Safety fallback timeout
                setTimeout(cleanup, 3000);
            } catch (err) {
                console.warn('Isolated iframe print failed:', err);
                cleanup();
            }
        };

        const iframeDoc = iframeWin.document;
        iframeDoc.open();
        iframeDoc.write(htmlContent);
        iframeDoc.close();

        // Wait for all images in iframe to load
        const images = iframeDoc.images;
        if (images && images.length > 0) {
            let pendingImages = 0;
            let finished = false;

            const onDone = () => {
                pendingImages--;
                if (pendingImages <= 0 && !finished) {
                    finished = true;
                    setTimeout(triggerPrint, 100);
                }
            };

            for (let i = 0; i < images.length; i++) {
                const img = images[i];
                if (!img.complete) {
                    pendingImages++;
                    img.onload = onDone;
                    img.onerror = onDone;
                }
            }

            if (pendingImages === 0) {
                setTimeout(triggerPrint, 100);
            } else {
                // Safety timeout in case image hanging
                setTimeout(() => {
                    if (!finished) {
                        finished = true;
                        triggerPrint();
                    }
                }, 1200);
            }
        } else {
            setTimeout(triggerPrint, 100);
        }
    });
}

/**
 * High-level function: prints item tags based on configured settings (A4 or Thermal Roll)
 * using isolated hidden iframe printing.
 *
 * @param {Object} options
 * @param {Object} options.item
 * @param {Object} options.settings
 * @param {number} [options.copies=1]
 * @param {number} [options.start=1]
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function printItemTags({ item, settings = {}, copies = 1, start = 1 }) {
    const isA4 = settings.tsPrintType === 'a4';

    if (isA4) {
        const validation = validateA4LabelLayout(settings);
        if (!validation.valid) {
            return { success: false, error: validation.error };
        }
        const html = buildA4LabelSheetHTML({ item, settings, copies, start });
        await executeIsolatedIframePrint(html, 'A4 Label Print Frame');
        return { success: true };
    } else {
        const html = buildThermalTagHTML({ item, settings, copies });
        await executeIsolatedIframePrint(html, 'Thermal Tag Print Frame');
        return { success: true };
    }
}

/**
 * Prints any generic A4 document (Purchase Invoice, Customer Statement, Vendor Statement, Voucher)
 * inside an isolated hidden iframe with strict A4 portrait geometry.
 *
 * @param {string} documentHtml - The inner document HTML content
 * @param {string} [title='Document'] - Window title for the print job
 * @returns {Promise<void>}
 */
export async function printA4Document(documentHtml, title = 'Document') {
    const fullHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        *, *::before, *::after {
            box-sizing: border-box;
        }
        @page {
            size: A4 portrait;
            margin: 0;
        }
        html, body {
            margin: 0;
            padding: 0;
            background: white !important;
            font-family: 'Manrope', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        .a4-page, .a4-document-page {
            width: 210mm;
            min-height: 297mm;
            padding: 8mm 10mm;
            box-sizing: border-box;
            background: white;
            margin: 0 auto;
        }
        @media print {
            .a4-page, .a4-document-page {
                width: 210mm;
                padding: 8mm 10mm;
                box-shadow: none !important;
                border: none !important;
            }
            .no-print {
                display: none !important;
            }
        }
    </style>
</head>
<body>
    <div class="a4-page">
        ${documentHtml}
    </div>
</body>
</html>`;

    await executeIsolatedIframePrint(fullHtml, `${title} Print Frame`);
}

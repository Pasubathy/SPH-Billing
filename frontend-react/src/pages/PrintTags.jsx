import React, { useEffect, useState } from 'react';
import AutoScalingLabel from '../components/AutoScalingLabel';
import { validateA4LabelLayout } from '../utils/a4Printer';

const PrintTags = () => {
    const [printData, setPrintData] = useState(null);

    useEffect(() => {
        try {
            const dataStr = localStorage.getItem('printItemData');
            if (dataStr) {
                setPrintData(JSON.parse(dataStr));
            }
        } catch (e) {
            console.error('Failed to parse print data', e);
        }
    }, []);

    const defaultSettings = {
        tsPrintType: 'thermal',
        tsWidth: 50, tsHeight: 25,
        tsMarginTop: 2, tsMarginBottom: 2, tsMarginLeft: 2, tsMarginRight: 2,
        tsAlign: 'Left',
        tsOptCode: true, tsSizeCode: 12,
        tsOptName: true, tsSizeName: 14,
        tsOptPrice: true, tsSizePrice: 16,
        tsOptQR: true, tsSizeQR: 35,
        tsA4Rows: 10, tsA4Cols: 4, tsA4HSpace: 2, tsA4VSpace: 2, 
        tsA4MarginTop: 12, tsA4MarginBottom: 12, tsA4MarginLeft: 10, tsA4MarginRight: 10
    };

    const item = printData?.item;
    const settings = { ...defaultSettings, ...(printData?.settings || {}) };
    const copies = printData?.copies || 1;
    const start = printData?.start || 1;
    const isA4 = settings.tsPrintType === 'a4';

    const validation = isA4 ? validateA4LabelLayout(settings) : { valid: true };

    useEffect(() => {
        if (printData && validation.valid) {
            const timer = setTimeout(() => {
                window.print();
                setTimeout(() => window.close(), 500);
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [printData, validation.valid]);

    if (!printData) return <div style={{ padding: '20px' }}>Loading print data...</div>;

    if (isA4 && !validation.valid) {
        return (
            <div style={{ padding: '40px', maxWidth: '600px', margin: '40px auto', background: '#FEF2F2', border: '1px solid #F87171', borderRadius: '8px', color: '#991B1B' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '18px' }}>⚠ A4 Sheet Layout Overflow</h3>
                <p style={{ margin: '0 0 16px 0', fontSize: '14px', lineHeight: '1.5' }}>
                    {validation.error}
                </p>
                <p style={{ margin: 0, fontSize: '13px', color: '#B91C1C' }}>
                    Please adjust your sticker dimensions, margins, or row/column counts in <b>Settings → Tag Setting</b> to fit within standard A4 boundaries (210mm × 297mm).
                </p>
            </div>
        );
    }

    if (!isA4) {
        // Thermal Roll
        return (
            <div style={{ background: 'white' }}>
                <style>
                    {`
                    @media print {
                        @page { margin: 0; size: ${settings.tsWidth}mm ${settings.tsHeight}mm; }
                        body, body * { visibility: visible !important; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                        .thermal-tag { margin: 0 !important; page-break-after: always; break-after: page; }
                    }
                    body { margin: 0; background: #e2e8f0; display: flex; flex-direction: column; align-items: center; gap: 20px; padding: 20px; }
                    `}
                </style>
                {Array.from({ length: copies }).map((_, i) => (
                    <div key={i} className="thermal-tag" style={{ background: 'white' }}>
                        <AutoScalingLabel tag={settings} itemData={item} />
                    </div>
                ))}
            </div>
        );
    }

    // A4 Sheet Layout (Pure CSS mm physical units)
    const rows = settings.tsA4Rows || 10;
    const cols = settings.tsA4Cols || 4;
    const labelsPerPage = rows * cols;
    const totalCells = (start - 1) + copies;
    const pages = Math.ceil(totalCells / labelsPerPage);

    const pagesArray = [];
    let currentCell = 0;

    for (let p = 0; p < pages; p++) {
        const pageLabels = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                currentCell++;
                if (currentCell < start || currentCell >= start + copies) {
                    pageLabels.push(
                        <div key={`empty-${currentCell}`} style={{ width: `${settings.tsWidth}mm`, height: `${settings.tsHeight}mm` }} />
                    );
                } else {
                    pageLabels.push(
                        <AutoScalingLabel key={`label-${currentCell}`} tag={settings} itemData={item} />
                    );
                }
            }
        }
        pagesArray.push(pageLabels);
    }

    return (
        <div className="print-wrapper">
            <style>
                {`
                .print-wrapper {
                    background: #e2e8f0;
                    min-height: 100vh;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    padding: 20px;
                    gap: 20px;
                }
                @page { 
                    size: A4 portrait; 
                    margin: 0; 
                }
                @media print {
                    html, body {
                        margin: 0;
                        padding: 0;
                        background: white !important;
                    }
                    body, body * { 
                        visibility: visible !important; 
                        -webkit-print-color-adjust: exact; 
                        print-color-adjust: exact; 
                    }
                    .print-wrapper {
                        background: transparent;
                        min-height: auto;
                        display: block !important;
                        padding: 0 !important;
                        margin: 0 !important;
                        gap: 0 !important;
                    }
                    .a4-page { 
                        page-break-after: always;
                        break-after: page;
                        box-shadow: none !important; 
                        margin: 0 !important; 
                    }
                    .a4-page:last-child {
                        page-break-after: auto;
                        break-after: auto;
                    }
                }
                `}
            </style>
            
            {pagesArray.map((pageLabels, pIndex) => (
                <div key={pIndex} className="a4-page" style={{
                    width: '210mm',
                    height: '297mm',
                    background: 'white',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    boxSizing: 'border-box',
                    overflow: 'hidden',
                    display: 'grid',
                    gridTemplateColumns: `repeat(${cols}, ${settings.tsWidth}mm)`,
                    gridTemplateRows: `repeat(${rows}, ${settings.tsHeight}mm)`,
                    columnGap: `${settings.tsA4HSpace ?? 2}mm`,
                    rowGap: `${settings.tsA4VSpace ?? 2}mm`,
                    padding: `${settings.tsA4MarginTop ?? 12}mm ${settings.tsA4MarginRight ?? 10}mm ${settings.tsA4MarginBottom ?? 12}mm ${settings.tsA4MarginLeft ?? 10}mm`,
                    justifyContent: 'start',
                    alignContent: 'start',
                    margin: '0 auto'
                }}>
                    {pageLabels}
                </div>
            ))}
        </div>
    );
};

export default PrintTags;

import React, { useEffect, useState } from 'react';
import AutoScalingLabel from '../components/AutoScalingLabel';

const PrintTags = () => {
    const [printData, setPrintData] = useState(null);

    useEffect(() => {
        try {
            const dataStr = localStorage.getItem('printItemData');
            if (dataStr) {
                setPrintData(JSON.parse(dataStr));
                // Optional: clear it after reading to avoid stale data later
                // localStorage.removeItem('printItemData');
            }
        } catch (e) {
            console.error('Failed to parse print data', e);
        }
    }, []);

    useEffect(() => {
        if (printData) {
            // Give React a moment to render the DOM and AutoScalingLabel to calculate sizes
            const timer = setTimeout(() => {
                window.print();
                // Optionally close the window after printing
                setTimeout(() => window.close(), 500);
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [printData]);

    if (!printData) return <div style={{ padding: '20px' }}>Loading print data...</div>;

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

    const item = printData.item;
    const settings = { ...defaultSettings, ...printData.settings };
    const copies = printData.copies || 1;
    const start = printData.start || 1;
    
    const isA4 = settings.tsPrintType === 'a4';

    if (!isA4) {
        // Thermal Roll
        return (
            <div style={{ background: 'white' }}>
                <style>
                    {`
                    @media print {
                        @page { margin: 0; size: ${settings.tsWidth}mm ${settings.tsHeight}mm; }
                        body, body * { visibility: visible !important; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                        .thermal-tag { margin: 0 !important; page-break-after: always; }
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

    // A4 Sheet
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
                        <div key={`empty-${currentCell}`} style={{ width: `${settings.tsWidth * 3.78}px`, height: `${settings.tsHeight * 3.78}px` }} />
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
                @media print {
                    @page { 
                        size: A4 portrait; 
                        margin: 0; 
                    }
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
                        display: block !important; /* Remove flex to prevent alignment issues */
                        padding: 0 !important; /* Root cause of the top blank space */
                        margin: 0 !important;
                        gap: 0 !important;
                    }
                    .a4-page { 
                        page-break-after: always; 
                        box-shadow: none !important; 
                        margin: 0 !important; 
                    }
                }
                `}
            </style>
            
            {pagesArray.map((pageLabels, pIndex) => (
                <div key={pIndex} className="a4-page" style={{
                    width: `${210 * 3.78}px`,
                    height: `${297 * 3.78}px`,
                    background: 'white',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    boxSizing: 'border-box',
                    overflow: 'hidden',
                    display: 'grid',
                    gridTemplateColumns: `repeat(${cols}, ${settings.tsWidth * 3.78}px)`,
                    gridTemplateRows: `repeat(${rows}, ${settings.tsHeight * 3.78}px)`,
                    columnGap: `${(settings.tsA4HSpace ?? 2) * 3.78}px`,
                    rowGap: `${(settings.tsA4VSpace ?? 2) * 3.78}px`,
                    padding: `${(settings.tsA4MarginTop ?? 12) * 3.78}px ${(settings.tsA4MarginRight ?? 10) * 3.78}px ${(settings.tsA4MarginBottom ?? 12) * 3.78}px ${(settings.tsA4MarginLeft ?? 10) * 3.78}px`,
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

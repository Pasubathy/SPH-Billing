import React, { useLayoutEffect, useRef, useState } from 'react';

const MIN_FONT_SIZE = 8;
const MIN_QR_SIZE = 16;

const AutoScalingLabel = ({
    tag,
    itemData,
    onValidationUpdate = () => { }
}) => {
    const containerRef = useRef(null);
    const contentRef = useRef(null);
    
    // State to track dynamically dropped fields
    const [droppedFields, setDroppedFields] = useState({});
    
    // Single scale factor
    const [scale, setScale] = useState(1);
    const [isValid, setIsValid] = useState(true);

    const physicalWidth = tag.tsWidth * 3.78;
    const physicalHeight = tag.tsHeight * 3.78;
    
    const paddingTop = (tag.tsMarginTop ?? 0) * 3.78;
    const paddingRight = (tag.tsMarginRight ?? 0) * 3.78;
    const paddingBottom = (tag.tsMarginBottom ?? 0) * 3.78;
    const paddingLeft = (tag.tsMarginLeft ?? 0) * 3.78;

    const availableWidth = physicalWidth - paddingLeft - paddingRight;
    const availableHeight = physicalHeight - paddingTop - paddingBottom;

    useLayoutEffect(() => {
        // Reset scale and dropped fields on props change
        setScale(1);
        setDroppedFields({});
        setIsValid(true);
    }, [tag, itemData]);

    useLayoutEffect(() => {
        if (!containerRef.current || !contentRef.current) return;

        const contentHeight = contentRef.current.scrollHeight;
        
        if (contentHeight > availableHeight && availableHeight > 0) {
            // Need to scale down
            const calculatedScale = availableHeight / contentHeight;
            
            const fontSizes = [
                !droppedFields.optCode && tag.tsOptCode ? tag.tsSizeCode : 0,
                !droppedFields.optName && tag.tsOptName ? tag.tsSizeName : 0,
                !droppedFields.optPrice && tag.tsOptPrice ? tag.tsSizePrice : 0
            ].filter(s => s > 0);
            
            const maxFontSize = Math.max(...(fontSizes.length > 0 ? fontSizes : [MIN_FONT_SIZE]));
            const minScaleForFont = MIN_FONT_SIZE / maxFontSize;
            
            const qrSizePx = (tag.tsSizeQR / 100) * physicalWidth;
            const minScaleForQR = tag.tsOptQR ? MIN_QR_SIZE / qrSizePx : 0;
            
            const absoluteMinScale = Math.max(minScaleForFont, minScaleForQR);
            
            if (calculatedScale < absoluteMinScale) {
                // Cannot scale enough without violating minimums. Try dropping a field based on priority.
                const fieldToDrop = FIELD_PRIORITY.find(field => {
                    const tagKey = 'ts' + field.charAt(0).toUpperCase() + field.slice(1); // e.g. tsOptDesc
                    return tag[tagKey] && !droppedFields[field];
                });

                if (fieldToDrop) {
                    setDroppedFields(prev => ({ ...prev, [fieldToDrop]: true }));
                } else {
                    // Nothing left to drop (Name, Price, QR are mandatory). Invalid template.
                    setIsValid(false);
                    onValidationUpdate(false);
                }
            } else {
                setScale(calculatedScale);
                setIsValid(true);
                onValidationUpdate(true);
            }
        } else {
            setScale(1);
            setIsValid(true);
            onValidationUpdate(true);
        }
    }, [availableHeight, tag, itemData, droppedFields]);

    const qrSize = (tag.tsSizeQR / 100) * physicalWidth;

    return (
        <div 
            ref={containerRef}
            style={{ 
                width: `${physicalWidth}px`, 
                height: `${physicalHeight}px`, 
                padding: `${paddingTop}px ${paddingRight}px ${paddingBottom}px ${paddingLeft}px`, 
                boxSizing: 'border-box', 
                overflow: 'hidden', 
                background: 'white',
                border: tag.tsPrintType === 'a4' ? '1px solid var(--border-color)' : 'none',
                boxShadow: tag.tsPrintType !== 'a4' ? '0 4px 6px -1px rgba(0,0,0,0.1)' : 'none',
                position: 'relative'
            }}
        >
            <div 
                ref={contentRef}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: tag.tsAlign === 'Center' ? 'center' : tag.tsAlign === 'Right' ? 'flex-end' : 'flex-start',
                    gap: `${8 * scale}px`,
                    width: '100%',
                    transformOrigin: 'top left'
                }}
            >
                {tag.tsOptQR && (
                    <img 
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${itemData?.code || '1001'}`} 
                        style={{ 
                            width: `${qrSize * scale}px`, 
                            height: `${qrSize * scale}px`, 
                            objectFit: 'contain', 
                            flexShrink: 0 
                        }} 
                        alt="QR" 
                    />
                )}
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: `${2 * scale}px`, textAlign: tag.tsAlign.toLowerCase(), minWidth: 0, flex: 1 }}>
                    {tag.tsOptDesc && !droppedFields.optDesc && (
                        <div style={{ fontSize: `${Math.max(tag.tsSizeDesc * scale, MIN_FONT_SIZE)}px`, fontWeight: '400', color: '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {itemData?.desc || 'Product description'}
                        </div>
                    )}
                    
                    {tag.tsOptCat && !droppedFields.optCat && (
                        <div style={{ fontSize: `${Math.max(tag.tsSizeCat * scale, MIN_FONT_SIZE)}px`, fontWeight: '500', color: '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {itemData?.category || 'Hardware'}
                        </div>
                    )}
                    
                    {tag.tsOptBrand && !droppedFields.optBrand && (
                        <div style={{ fontSize: `${Math.max(tag.tsSizeBrand * scale, MIN_FONT_SIZE)}px`, fontWeight: '500', color: '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {itemData?.brand || 'Generic'}
                        </div>
                    )}
                    
                    {tag.tsOptUnit && !droppedFields.optUnit && (
                        <div style={{ fontSize: `${Math.max(tag.tsSizeUnit * scale, MIN_FONT_SIZE)}px`, fontWeight: '500', color: '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {itemData?.unit || 'Box'}
                        </div>
                    )}
                    
                    {tag.tsOptCode && !droppedFields.optCode && (
                        <div style={{ 
                            fontSize: `${Math.max(tag.tsSizeCode * scale, MIN_FONT_SIZE)}px`, 
                            fontWeight: '600', color: '#000', 
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' 
                        }}>
                            {itemData?.code || '1001'}
                        </div>
                    )}
                    
                    {tag.tsOptName && !droppedFields.optName && (
                        <div style={{ 
                            fontSize: `${Math.max(tag.tsSizeName * scale, MIN_FONT_SIZE)}px`, 
                            fontWeight: '600', color: '#000', 
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' 
                        }}>
                            {itemData?.name || 'Nails'}
                        </div>
                    )}
                    
                    {tag.tsOptPrice && !droppedFields.optPrice && (
                        <div style={{ 
                            fontSize: `${Math.max(tag.tsSizePrice * scale, MIN_FONT_SIZE)}px`, 
                            fontWeight: '600', color: '#000', 
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' 
                        }}>
                            {itemData?.price || '₹150.00/Box'}
                        </div>
                    )}
                </div>
            </div>
            
            {!isValid && (
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, 
                    background: 'rgba(255,0,0,0.1)', 
                    border: '2px solid red',
                    zIndex: 10, pointerEvents: 'none'
                }} />
            )}
        </div>
    );
};

export default AutoScalingLabel;

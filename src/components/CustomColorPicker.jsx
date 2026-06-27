import React, { useRef, useState, useEffect } from 'react';
import { hexToHsv, hsvToHex } from '../utils/colorUtils';

export const CustomColorPicker = ({ initialHex, onChange, disabled }) => {
    const [h, setH] = useState(0);
    const [s, setS] = useState(0);
    const [v, setV] = useState(100);
    const [hexInput, setHexInput] = useState(initialHex || '#ffffff');
    const areaRef = useRef(null);

    useEffect(() => {
        const hsv = hexToHsv(initialHex || '#ffffff');
        setH(hsv.h); setS(hsv.s); setV(hsv.v);
        setHexInput(initialHex || '#ffffff');
    }, [initialHex]);

    const emitColor = (newH, newS, newV) => {
        const hex = hsvToHex(newH, newS, newV);
        setHexInput(hex.toUpperCase());
        onChange(hex);
    };

    const handleHexChange = (e) => {
        let val = e.target.value.trim();
        setHexInput(val);
        if (!val.startsWith('#')) val = '#' + val;
        if (/^#[0-9A-Fa-f]{6}$/i.test(val)) {
            const hsv = hexToHsv(val);
            setH(hsv.h); setS(hsv.s); setV(hsv.v);
            onChange(val);
        }
    };

    const handleAreaDrag = (e) => {
        if (!areaRef.current || disabled) return;
        const rect = areaRef.current.getBoundingClientRect();
        let x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        let y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
        let newS = (x / rect.width) * 100;
        let newV = 100 - ((y / rect.height) * 100);
        setS(newS); setV(newV);
        emitColor(h, newS, newV);
    };

    return (
        <div className={`custom-color-picker ${disabled ? 'disabled' : ''}`}>
            <div 
                className="color-area" 
                ref={areaRef}
                onMouseDown={(e) => {
                    handleAreaDrag(e);
                    const onMouseMove = (ev) => handleAreaDrag(ev);
                    const onMouseUp = () => {
                        document.removeEventListener('mousemove', onMouseMove);
                        document.removeEventListener('mouseup', onMouseUp);
                    };
                    document.addEventListener('mousemove', onMouseMove);
                    document.addEventListener('mouseup', onMouseUp);
                }}
                style={{ backgroundColor: `hsl(${h}, 100%, 50%)` }}
            >
                <div className="color-dot" style={{ left: `${s}%`, top: `${100 - v}%` }}></div>
            </div>
            <div className="hue-slider-container">
                <input 
                    type="range" 
                    min="0" max="360" 
                    value={h} 
                    onChange={(e) => {
                        const newH = parseFloat(e.target.value);
                        setH(newH); emitColor(newH, s, v);
                    }} 
                    className="hue-slider" 
                />
            </div>
            <div className="color-input-row">
                <div className="color-preview-box" style={{ backgroundColor: hsvToHex(h,s,v) }}></div>
                <input type="text" value={hexInput} onChange={handleHexChange} className="color-text-input" />
            </div>
        </div>
    );
};

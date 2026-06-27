import React, { useContext, useRef, useState, useEffect } from 'react';
import { EditorContext } from '../context/EditorContext';
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

export const SidebarRight = () => {
    const { 
        segments, setSegments, 
        visualLines, lineSettings, updateLineSettings,
        isPlaying, currentLineIndex, 
        currentSelectionCharIds, setCurrentSelectionCharIds,
        charOverrides, setCharOverrides,
        fontFamily, setFontFamily,
        fontWeight, setFontWeight,
        textTransform, setTextTransform,
        fontSize, setFontSize,
        textAlign, setTextAlign,
        letterSpacing, setLetterSpacing
    } = useContext(EditorContext);

    const renderTypographySettings = () => (
        <div className="typography-settings" style={{ marginTop: 32, borderTop: '1px solid var(--border)', paddingTop: 24 }}>
            <span className="context-label" style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 16, display: 'block', fontWeight: 500 }}>Global Typography</span>
            
            <div className="prop-group" style={{ marginBottom: 16 }}>
                <label>Font Family</label>
                <select className="panel-select" value={fontFamily} onChange={(e) => setFontFamily(e.target.value)}>
                    <option value="Inter, sans-serif">Inter</option>
                    <option value="Arial, sans-serif">Arial</option>
                    <option value="'Courier New', Courier, monospace">Courier New</option>
                    <option value="'Times New Roman', Times, serif">Times New Roman</option>
                    <option value="Impact, fantasy">Impact</option>
                    <option value="'Comic Sans MS', cursive">Comic Sans</option>
                </select>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                <div className="prop-group" style={{ flex: 1 }}>
                    <label>Weight</label>
                    <select className="panel-select" value={fontWeight} onChange={(e) => setFontWeight(parseInt(e.target.value))}>
                        <option value={400}>Regular</option>
                        <option value={500}>Medium</option>
                        <option value={700}>Bold</option>
                        <option value={900}>Black</option>
                    </select>
                </div>
                <div className="prop-group" style={{ flex: 1 }}>
                    <label>Size</label>
                    <input className="panel-input" type="number" value={fontSize} onChange={(e) => setFontSize(parseFloat(e.target.value) || 10)} />
                </div>
            </div>

            <div className="prop-group" style={{ marginBottom: 16 }}>
                <label>Transform</label>
                <select className="panel-select" value={textTransform} onChange={(e) => setTextTransform(e.target.value)}>
                    <option value="none">Normal</option>
                    <option value="uppercase">UPPERCASE</option>
                    <option value="lowercase">lowercase</option>
                    <option value="capitalize">Capitalize</option>
                </select>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
                <div className="prop-group" style={{ flex: 1 }}>
                    <label>Align</label>
                    <select className="panel-select" value={textAlign} onChange={(e) => setTextAlign(e.target.value)}>
                        <option value="left">Left</option>
                        <option value="center">Center</option>
                        <option value="right">Right</option>
                    </select>
                </div>
                <div className="prop-group" style={{ flex: 1 }}>
                    <label>Spacing</label>
                    <input className="panel-input" type="number" step="0.5" value={letterSpacing} onChange={(e) => setLetterSpacing(parseFloat(e.target.value) || 0)} />
                </div>
            </div>
        </div>
    );

    const hasSelection = currentSelectionCharIds.length > 0;
    const disabledNotice = isPlaying ? (
        <div style={{ background: 'var(--bg-input)', padding: 10, borderRadius: 6, border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 11, marginBottom: 20, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            ⏸ Pause playback to edit
        </div>
    ) : null;

    if (hasSelection) {
        const firstCharId = currentSelectionCharIds[0];
        const firstCharColor = charOverrides[firstCharId] || lineSettings[currentLineIndex]?.color || '#ffffff';

        const updateSelectionColor = (color) => {
            const newOverrides = { ...charOverrides };
            currentSelectionCharIds.forEach(id => {
                newOverrides[id] = color;
            });
            setCharOverrides(newOverrides);
        };

        const clearSelectionOverrides = () => {
            const newOverrides = { ...charOverrides };
            currentSelectionCharIds.forEach(id => {
                delete newOverrides[id];
            });
            setCharOverrides(newOverrides);
        };

        const deselectAll = () => {
            window.getSelection().removeAllRanges();
            setCurrentSelectionCharIds([]);
        };

        return (
            <div className="sidebar right-sidebar">
                <h2>Inspector</h2>
                <div id="inspector-content">
                    {disabledNotice}
                    <span className="context-label" style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, display: 'block', fontWeight: 500 }}>Selection Override</span>
                    <h3 className="context-title" style={{ fontSize: 20, fontWeight: 500, margin: '0 0 25px 0', color: '#fff' }}>{currentSelectionCharIds.length} Letters</h3>
                    <label>Highlight Color</label>
                    <CustomColorPicker initialHex={firstCharColor} onChange={updateSelectionColor} disabled={isPlaying} />
                    <button className="btn-ghost" onClick={clearSelectionOverrides} disabled={isPlaying}>Reset to Line Color</button>
                    <button className="btn-ghost" onClick={deselectAll} disabled={isPlaying}>Deselect</button>
                </div>
            </div>
        );
    }

    if (!visualLines[currentLineIndex]) {
        return (
            <div className="sidebar right-sidebar">
                <h2>Inspector</h2>
                <div id="inspector-content">
                    {renderTypographySettings()}
                </div>
            </div>
        );
    }

    const activeLine = visualLines[currentLineIndex];
    if (!activeLine || activeLine.length === 0) return null;

    const segIndex = activeLine[0].segIndex;
    const segText = segments[segIndex]?.text || '';
    const currentDur = lineSettings[currentLineIndex]?.duration || 0.1;

    const updateSegmentText = (newText) => {
        if (!segments[segIndex]) return;
        const newSegments = [...segments];
        newSegments[segIndex].text = newText;
        setSegments(newSegments);
    };

    const updateLineDuration = (val) => {
        let newDur = parseFloat(val) || 0.1;
        if (newDur < 0.1) newDur = 0.1;

        const newSettings = { ...lineSettings };
        const seg = segments[segIndex];
        if (!seg) return;

        if (seg.audioDuration !== null && seg.audioDuration !== undefined) {
            const segmentLineIndices = [];
            visualLines.forEach((line, idx) => { if (line[0].segIndex === segIndex) segmentLineIndices.push(idx); });

            if (segmentLineIndices.length > 1) {
                const oldDur = parseFloat(newSettings[currentLineIndex].duration);
                const diff = newDur - oldDur;
                const localIdx = segmentLineIndices.indexOf(currentLineIndex);
                let targetLocalIdx = localIdx + 1;
                if (targetLocalIdx >= segmentLineIndices.length) targetLocalIdx = localIdx - 1;
                
                const targetIdx = segmentLineIndices[targetLocalIdx];
                let targetDur = parseFloat(newSettings[targetIdx].duration) - diff;
                
                if (targetDur < 0.1) {
                    const maxAffordableDiff = parseFloat(newSettings[targetIdx].duration) - 0.1;
                    newDur = oldDur + maxAffordableDiff;
                    targetDur = 0.1;
                }
                newSettings[targetIdx].duration = targetDur.toFixed(2);
                newSettings[currentLineIndex].duration = newDur.toFixed(2);
            }
        } else {
            newSettings[currentLineIndex].duration = newDur.toFixed(2);
        }
        updateLineSettings(visualLines, newSettings, segments);
    };

    const updateLineColor = (val) => {
        const newSettings = { ...lineSettings };
        if (!newSettings[currentLineIndex]) newSettings[currentLineIndex] = {};
        newSettings[currentLineIndex].color = val;
        updateLineSettings(visualLines, newSettings, segments);
    };

    return (
        <div className="sidebar right-sidebar">
            <h2>Inspector</h2>
            <div id="inspector-content">
                {disabledNotice}
                <span className="context-label" style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, display: 'block', fontWeight: 500 }}>Active Line</span>
                <h3 className="context-title" style={{ fontSize: 20, fontWeight: 500, margin: '0 0 25px 0', color: '#fff' }}>Line {currentLineIndex + 1}</h3>
                
                <div className="prop-group" style={{ marginBottom: 24 }}>
                    <label>Text Content <span style={{ opacity: 0.4, fontWeight: 400 }}>(Segment {segIndex + 1})</span></label>
                    <textarea rows="4" disabled={isPlaying} value={segText} onChange={(e) => updateSegmentText(e.target.value)}></textarea>
                </div>

                <div className="prop-group" style={{ marginBottom: 24 }}>
                    <label>Duration (s)</label>
                    <input type="number" step="0.1" value={currentDur} disabled={isPlaying} onChange={(e) => updateLineDuration(e.target.value)} />
                </div>
                
                <label>Line Color</label>
                <CustomColorPicker initialHex={lineSettings[currentLineIndex]?.color || '#ffffff'} onChange={updateLineColor} disabled={isPlaying} />

                {renderTypographySettings()}
            </div>
        </div>
    );
};

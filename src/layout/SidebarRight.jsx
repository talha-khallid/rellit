import React, { useContext } from 'react';
import { EditorContext } from '../context/EditorContext';
import { CustomColorPicker } from '../components/CustomColorPicker';

export const SidebarRight = () => {
    const { 
        segments, setSegments, 
        visualLines, lineSettings, updateLineSettings,
        isPlaying, currentLineIndex, 
        currentSelectionCharIds, setCurrentSelectionCharIds,
        charOverrides, setCharOverrides,
        customComponents, setCustomComponents
    } = useContext(EditorContext);

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

    const activeLineComponents = [];
    if (segText) {
        const matches = segText.matchAll(/\[COMP:(comp_[0-9]+)\]/g);
        for (const match of matches) {
            const compId = match[1];
            const comp = customComponents.find(c => c.id === compId);
            if (comp && !activeLineComponents.find(c => c.id === compId)) {
                activeLineComponents.push(comp);
            }
        }
    }

    const updateComponentProp = (id, prop, value) => {
        const newComps = customComponents.map(c => c.id === id ? { ...c, [prop]: value } : c);
        setCustomComponents(newComps);
    };

    const removeComponent = (id) => {
        const newText = segText.replace(new RegExp(`\\s*\\[COMP:${id}\\]\\s*`, 'g'), ' ').replace(/  +/g, ' ').trim();
        updateSegmentText(newText);
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
                    <textarea 
                        rows="4" 
                        disabled={isPlaying} 
                        value={segText} 
                        onChange={(e) => updateSegmentText(e.target.value)}
                    ></textarea>
                </div>

                {activeLineComponents.length > 0 && (
                    <div className="prop-group" style={{ marginBottom: 24, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                        <label>Inline Components on Line {currentLineIndex + 1}</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
                            {activeLineComponents.map(comp => (
                                <div key={comp.id} style={{ 
                                    background: 'var(--bg-input)', padding: '12px', borderRadius: '8px', 
                                    border: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center'
                                }}>
                                    <div style={{ width: 40, height: 40, flexShrink: 0, background: 'var(--bg)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <img src={comp.src} alt="comp" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                    </div>
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>ID: {comp.id.substring(5)}</span>
                                            <button className="btn-ghost" style={{ padding: '2px 6px', fontSize: 10, color: '#ff4444' }} onClick={() => removeComponent(comp.id)}>Remove</button>
                                        </div>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <input type="number" className="panel-input" value={comp.size} onChange={e => updateComponentProp(comp.id, 'size', parseInt(e.target.value) || 40)} style={{ width: 50, padding: '4px 6px', fontSize: 11 }} title="Size (px)" />
                                            <select className="panel-select" value={comp.animation} onChange={e => updateComponentProp(comp.id, 'animation', e.target.value)} style={{ padding: '4px 6px', fontSize: 11, flex: 1 }}>
                                                <option value="pop-rotate">Pop & Rotate</option>
                                                <option value="pop">Pop Up</option>
                                                <option value="fade">Fade In</option>
                                                <option value="none">None</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="prop-group" style={{ marginBottom: 24 }}>
                    <label>Duration (s)</label>
                    <input type="number" step="0.1" value={currentDur} disabled={isPlaying} onChange={(e) => updateLineDuration(e.target.value)} />
                </div>
                
                <label>Line Color</label>
                <CustomColorPicker initialHex={lineSettings[currentLineIndex]?.color || '#ffffff'} onChange={updateLineColor} disabled={isPlaying} />
            </div>
        </div>
    );
};

import React, { useContext } from 'react';
import { EditorContext } from '../context/EditorContext';
import { CustomColorPicker } from '../components/CustomColorPicker';
import { BEHAVIOR_OPTIONS, getBehaviors } from '../utils/componentStyle';

const COMP_TOKEN_RE = /\[COMP:comp_\d+\]/g;
const IMG_MARKER = '[img]';

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
                    <div className="panel-header" style={{ marginBottom: 20 }}>
                        <span className="panel-eyebrow">Selection Override</span>
                        <h3 className="panel-title">{currentSelectionCharIds.length} Letter{currentSelectionCharIds.length === 1 ? '' : 's'}</h3>
                    </div>
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
                <div className="inspector-empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"></path>
                    </svg>
                    <p>Select a line in the timeline to edit its text, timing and colors.</p>
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

    // The raw text stores inline images as [COMP:comp_123] tokens. We show
    // them as [img] markers and map edits back so the IDs never surface.
    const segTokens = segText.match(COMP_TOKEN_RE) || [];
    const displayText = segText.replace(COMP_TOKEN_RE, IMG_MARKER);
    const handleDisplayChange = (val) => {
        let i = 0;
        const raw = val.split(IMG_MARKER).reduce((acc, part, idx, arr) => {
            acc += part;
            if (idx < arr.length - 1) {
                acc += segTokens[i++] || '';
            }
            return acc;
        }, '');
        updateSegmentText(raw);
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
        const newComps = customComponents.map(c => {
            if (c.id === id) {
                const newC = { ...c, [prop]: value };
                // The entrance plays out of the "before" state, so keep the
                // dim-* animations in sync when that becomes/stops being 'dim'.
                if (prop === 'beforeBehavior') {
                    if (value === 'dim' && (!c.animation || !c.animation.startsWith('dim-'))) {
                        newC.animation = 'dim-scale-rotate-left';
                    } else if (value !== 'dim' && c.animation && c.animation.startsWith('dim-')) {
                        newC.animation = 'scale-rotate-left';
                    }
                }
                return newC;
            }
            return c;
        });
        setCustomComponents(newComps);
    };

    const removeComponent = (id) => {
        const newText = segText.replace(new RegExp(`\\s*\\[COMP:${id}\\]\\s*`, 'g'), ' ').replace(/  +/g, ' ').trim();
        updateSegmentText(newText);
    };

    return (
        <div className="sidebar right-sidebar">
            <h2>Inspector</h2>
            <div id="inspector-content" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {disabledNotice}
                <div className="panel-header">
                    <span className="panel-eyebrow">Active Line</span>
                    <h3 className="panel-title">Line {currentLineIndex + 1}</h3>
                </div>

                <div className="field">
                    <label>Text <span style={{ opacity: 0.5, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>· Segment {segIndex + 1}</span></label>
                    <textarea
                        rows="4"
                        disabled={isPlaying}
                        value={displayText}
                        onChange={(e) => handleDisplayChange(e.target.value)}
                    ></textarea>
                    {segTokens.length > 0 && (
                        <p className="field-hint">[img] marks an inline image. Delete the marker to remove it from the text.</p>
                    )}
                </div>

                {activeLineComponents.length > 0 && (
                    <div className="field">
                        <label>Inline Images</label>
                        {activeLineComponents.map((comp, idx) => (
                            <div key={comp.id} className="comp-card">
                                <div className="comp-card-head">
                                    <div className="comp-thumb">
                                        <img src={comp.src} alt="" />
                                    </div>
                                    <span className="comp-card-title">Image{activeLineComponents.length > 1 ? ` ${idx + 1}` : ''}</span>
                                    <button className="icon-btn danger" title="Remove from line" onClick={() => removeComponent(comp.id)}>
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="3 6 5 6 21 6"></polyline>
                                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                        </svg>
                                    </button>
                                </div>
                                <div className="comp-card-body">
                                    <div className="field-row cols-3">
                                        <div className="field">
                                            <label>Size</label>
                                            <input type="number" className="panel-input" value={comp.size} onChange={e => updateComponentProp(comp.id, 'size', parseInt(e.target.value) || 60)} />
                                        </div>
                                        <div className="field">
                                            <label>X offset</label>
                                            <input type="number" className="panel-input" value={comp.offsetX || 0} onChange={e => updateComponentProp(comp.id, 'offsetX', parseInt(e.target.value) || 0)} />
                                        </div>
                                        <div className="field">
                                            <label>Y offset</label>
                                            <input type="number" className="panel-input" value={comp.offsetY || 0} onChange={e => updateComponentProp(comp.id, 'offsetY', parseInt(e.target.value) || 0)} />
                                        </div>
                                    </div>
                                    <div className="field-row cols-2">
                                        <div className="field">
                                            <label>Corner radius</label>
                                            <input type="number" className="panel-input" value={comp.borderRadius || 0} onChange={e => updateComponentProp(comp.id, 'borderRadius', Math.max(0, parseInt(e.target.value) || 0))} />
                                        </div>
                                        <div className="field">
                                            <label>Rotation (°)</label>
                                            <input type="number" className="panel-input" value={comp.rotation || 0} onChange={e => updateComponentProp(comp.id, 'rotation', parseInt(e.target.value) || 0)} />
                                        </div>
                                    </div>
                                    <div className="field">
                                        <label>Entrance</label>
                                        <select className="panel-select" value={comp.animation} onChange={e => updateComponentProp(comp.id, 'animation', e.target.value)}>
                                            {getBehaviors(comp).before === 'dim' ? (
                                                <>
                                                    <option value="dim-scale-rotate-left">Scale & rotate left</option>
                                                    <option value="dim-scale-rotate-right">Scale & rotate right</option>
                                                    <option value="dim-scale">Scale</option>
                                                    <option value="dim-bounce-rotate">Bounce & rotate</option>
                                                    <option value="none">None</option>
                                                </>
                                            ) : (
                                                <>
                                                    <option value="scale-rotate-left">Scale & rotate left</option>
                                                    <option value="scale-rotate-right">Scale & rotate right</option>
                                                    <option value="scale">Scale in</option>
                                                    <option value="bounce-rotate">Bounce & rotate</option>
                                                    <option value="slide-up">Slide up</option>
                                                    <option value="slide-down">Slide down</option>
                                                    <option value="spin-in">Spin in</option>
                                                    <option value="fade">Fade in</option>
                                                    <option value="none">None</option>
                                                </>
                                            )}
                                        </select>
                                    </div>
                                    <div className="field-row cols-2">
                                        <div className="field">
                                            <label>Before its moment</label>
                                            <select className="panel-select" value={getBehaviors(comp).before} onChange={e => updateComponentProp(comp.id, 'beforeBehavior', e.target.value)}>
                                                {BEHAVIOR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                            </select>
                                        </div>
                                        <div className="field">
                                            <label>After its moment</label>
                                            <select className="panel-select" value={getBehaviors(comp).after} onChange={e => updateComponentProp(comp.id, 'afterBehavior', e.target.value)}>
                                                {BEHAVIOR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div className="field">
                    <label>Duration (seconds)</label>
                    <input type="number" step="0.1" value={currentDur} disabled={isPlaying} onChange={(e) => updateLineDuration(e.target.value)} />
                </div>

                <div className="field">
                    <label>Line Color</label>
                    <CustomColorPicker initialHex={lineSettings[currentLineIndex]?.color || '#ffffff'} onChange={updateLineColor} disabled={isPlaying} />
                </div>
            </div>
        </div>
    );
};

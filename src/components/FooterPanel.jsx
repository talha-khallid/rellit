import React, { useContext } from 'react';
import { EditorContext } from '../context/EditorContext';
import { CustomColorPicker } from './CustomColorPicker';
import { newFooterItem, FOOTER_PROGRESS_STYLES } from '../utils/footer';

export const FooterPanel = () => {
    const { footerItems, setFooterItems, selectedFooterId, setSelectedFooterId } = useContext(EditorContext);

    const add = (type) => {
        const item = newFooterItem(type);
        setFooterItems([...footerItems, item]);
        setSelectedFooterId(item.id);
    };
    const update = (id, patch) => setFooterItems(footerItems.map(f => f.id === id ? { ...f, ...patch } : f));
    const remove = (id) => {
        setFooterItems(footerItems.filter(f => f.id !== id));
        if (selectedFooterId === id) setSelectedFooterId(null);
    };

    const label = (f) => f.type === 'text' ? `Text · “${(f.text || '').slice(0, 14)}”` : `Progress · ${f.barStyle}`;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="panel-header">
                <span className="panel-eyebrow">Bottom</span>
                <h3 className="panel-title">Footer</h3>
                <p className="panel-subtitle">Overlays pinned to the bottom of the video — a playback progress bar, a handle, and more. Position is adjustable.</p>
            </div>

            <div className="footer-add-row">
                <button className="btn-ghost" onClick={() => add('progress')}>+ Progress bar</button>
                <button className="btn-ghost" onClick={() => add('text')}>+ Text / handle</button>
            </div>

            {footerItems.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0', lineHeight: 1.6 }}>
                    Nothing in the footer yet.<br />Add a progress bar or a handle above.
                </p>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {footerItems.map(f => {
                        const isSel = selectedFooterId === f.id;
                        return (
                            <div key={f.id} className={`comp-card ${isSel ? 'selected' : ''}`}>
                                <div className="comp-card-head" style={{ cursor: 'pointer' }} onClick={() => setSelectedFooterId(isSel ? null : f.id)}>
                                    <span className="comp-card-title" style={{ marginLeft: 4 }}>{label(f)}</span>
                                    <button className="icon-btn danger" title="Delete" onClick={(e) => { e.stopPropagation(); remove(f.id); }}>
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="3 6 5 6 21 6"></polyline>
                                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                        </svg>
                                    </button>
                                </div>

                                {isSel && (
                                    <div className="comp-card-body">
                                        {f.type === 'progress' ? (
                                            <>
                                                <div className="field">
                                                    <label>Style</label>
                                                    <div className="seg-btns">
                                                        {FOOTER_PROGRESS_STYLES.map(s => (
                                                            <button key={s.id} className={`seg-btn ${f.barStyle === s.id ? 'active' : ''}`} onClick={() => update(f.id, { barStyle: s.id })}>{s.label}</button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="field">
                                                    <label>Color</label>
                                                    <CustomColorPicker initialHex={f.color} onChange={(hex) => update(f.id, { color: hex })} />
                                                </div>
                                                {f.barStyle === 'segments' && (
                                                    <Slider label={`Segments (${f.segments})`} min={2} max={20} step={1} value={f.segments} onChange={v => update(f.id, { segments: v })} />
                                                )}
                                                <Slider label={`Thickness (${f.thickness}px)`} min={2} max={40} step={1} value={f.thickness} onChange={v => update(f.id, { thickness: v })} />
                                                <Slider label={`Width (${f.widthPct}%)`} min={20} max={100} step={1} value={f.widthPct} onChange={v => update(f.id, { widthPct: v })} />
                                                <Slider label={`Track opacity (${Math.round((f.trackOpacity ?? 0.22) * 100)}%)`} min={0} max={100} step={1} value={Math.round((f.trackOpacity ?? 0.22) * 100)} onChange={v => update(f.id, { trackOpacity: v / 100 })} />
                                                <Slider label={`Distance from bottom (${f.bottomPct}%)`} min={0} max={40} step={0.5} value={f.bottomPct} onChange={v => update(f.id, { bottomPct: v })} />
                                            </>
                                        ) : (
                                            <>
                                                <div className="field">
                                                    <label>Text</label>
                                                    <input className="panel-input" type="text" value={f.text} onChange={e => update(f.id, { text: e.target.value })} />
                                                </div>
                                                <div className="field">
                                                    <label>Color</label>
                                                    <CustomColorPicker initialHex={f.color} onChange={(hex) => update(f.id, { color: hex })} />
                                                </div>
                                                <div className="field-row cols-2">
                                                    <div className="field">
                                                        <label>Size</label>
                                                        <input className="panel-input" type="number" value={f.fontSize} onChange={e => update(f.id, { fontSize: parseFloat(e.target.value) || 10 })} />
                                                    </div>
                                                    <div className="field">
                                                        <label>Weight</label>
                                                        <select className="panel-select" value={f.fontWeight} onChange={e => update(f.id, { fontWeight: parseInt(e.target.value) })}>
                                                            <option value={400}>Regular</option>
                                                            <option value={600}>Semibold</option>
                                                            <option value={700}>Bold</option>
                                                            <option value={900}>Black</option>
                                                        </select>
                                                    </div>
                                                </div>
                                                <div className="field">
                                                    <label>Align</label>
                                                    <div className="seg-btns">
                                                        {['left', 'center', 'right'].map(a => (
                                                            <button key={a} className={`seg-btn ${f.align === a ? 'active' : ''}`} onClick={() => update(f.id, { align: a })}>{a[0].toUpperCase() + a.slice(1)}</button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <Slider label={`Opacity (${Math.round((f.opacity ?? 1) * 100)}%)`} min={0} max={100} step={1} value={Math.round((f.opacity ?? 1) * 100)} onChange={v => update(f.id, { opacity: v / 100 })} />
                                                <Slider label={`Letter spacing (${f.letterSpacing}px)`} min={-2} max={12} step={0.5} value={f.letterSpacing} onChange={v => update(f.id, { letterSpacing: v })} />
                                                <Slider label={`Distance from bottom (${f.bottomPct}%)`} min={0} max={40} step={0.5} value={f.bottomPct} onChange={v => update(f.id, { bottomPct: v })} />
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

const Slider = ({ label, min, max, step, value, onChange }) => (
    <div className="field">
        <label>{label}</label>
        <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} style={{ width: '100%' }} />
    </div>
);

import React, { useContext } from 'react';
import { EditorContext } from '../context/EditorContext';
import { CustomColorPicker } from './CustomColorPicker';
import { newHeaderItem } from '../utils/header';

export const HeaderPanel = () => {
    const { headerItems, setHeaderItems, selectedHeaderId, setSelectedHeaderId } = useContext(EditorContext);

    const add = (type) => {
        const item = newHeaderItem(type);
        setHeaderItems([...headerItems, item]);
        setSelectedHeaderId(item.id);
    };
    const update = (id, patch) => setHeaderItems(headerItems.map(h => h.id === id ? { ...h, ...patch } : h));
    const remove = (id) => {
        setHeaderItems(headerItems.filter(h => h.id !== id));
        if (selectedHeaderId === id) setSelectedHeaderId(null);
    };

    const label = (h) => `Title · “${(h.text || '').slice(0, 16)}”`;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="panel-header">
                <span className="panel-eyebrow">Top</span>
                <h3 className="panel-title">Header</h3>
                <p className="panel-subtitle">A title pinned to the top of the video. It stays clear of the captions — when media pushes them up it follows up, and slides away if there's no room.</p>
            </div>

            <div className="footer-add-row">
                <button className="btn-ghost" onClick={() => add('text')}>+ Title / text</button>
            </div>

            {headerItems.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0', lineHeight: 1.6 }}>
                    No header yet.<br />Add a title above.
                </p>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {headerItems.map(h => {
                        const isSel = selectedHeaderId === h.id;
                        return (
                            <div key={h.id} className={`comp-card ${isSel ? 'selected' : ''}`}>
                                <div className="comp-card-head" style={{ cursor: 'pointer' }} onClick={() => setSelectedHeaderId(isSel ? null : h.id)}>
                                    <span className="comp-card-title" style={{ marginLeft: 4 }}>{label(h)}</span>
                                    <button className="icon-btn danger" title="Delete" onClick={(e) => { e.stopPropagation(); remove(h.id); }}>
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="3 6 5 6 21 6"></polyline>
                                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                        </svg>
                                    </button>
                                </div>

                                {isSel && (
                                    <div className="comp-card-body">
                                        <div className="field">
                                            <label>Text</label>
                                            <input className="panel-input" type="text" value={h.text} onChange={e => update(h.id, { text: e.target.value })} />
                                        </div>
                                        <div className="field">
                                            <label>Color</label>
                                            <CustomColorPicker initialHex={h.color} onChange={(hex) => update(h.id, { color: hex })} />
                                        </div>
                                        <div className="field-row cols-2">
                                            <div className="field">
                                                <label>Size</label>
                                                <input className="panel-input" type="number" value={h.fontSize} onChange={e => update(h.id, { fontSize: parseFloat(e.target.value) || 10 })} />
                                            </div>
                                            <div className="field">
                                                <label>Weight</label>
                                                <select className="panel-select" value={h.fontWeight} onChange={e => update(h.id, { fontWeight: parseInt(e.target.value) })}>
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
                                                    <button key={a} className={`seg-btn ${h.align === a ? 'active' : ''}`} onClick={() => update(h.id, { align: a })}>{a[0].toUpperCase() + a.slice(1)}</button>
                                                ))}
                                            </div>
                                        </div>
                                        <Slider label={`Opacity (${Math.round((h.opacity ?? 1) * 100)}%)`} min={0} max={100} step={1} value={Math.round((h.opacity ?? 1) * 100)} onChange={v => update(h.id, { opacity: v / 100 })} />
                                        <Slider label={`Letter spacing (${h.letterSpacing}px)`} min={-2} max={12} step={0.5} value={h.letterSpacing} onChange={v => update(h.id, { letterSpacing: v })} />
                                        <Slider label={`Distance from top (${h.topPct}%)`} min={0} max={40} step={0.5} value={h.topPct} onChange={v => update(h.id, { topPct: v })} />

                                        <div className="field" style={{ marginTop: 4 }}>
                                            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                                                <span>Follow captions</span>
                                                <input type="checkbox" checked={h.follow !== false} onChange={e => update(h.id, { follow: e.target.checked })} />
                                            </label>
                                            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0', lineHeight: 1.5 }}>
                                                Rise with the captions when media pushes them up, and hide when there's no room.
                                            </p>
                                        </div>
                                        {h.follow !== false && (
                                            <Slider label={`Gap above captions (${h.gap}px)`} min={0} max={160} step={2} value={h.gap} onChange={v => update(h.id, { gap: v })} />
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

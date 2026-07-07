import React, { useState, useContext, useRef, useEffect } from 'react';
import { EditorContext } from '../context/EditorContext';

export const ComponentCreator = () => {
    const {
        customComponents, setCustomComponents,
        armedComponentId, setArmedComponentId,
        segments, setSegments
    } = useContext(EditorContext);
    const [imageSrc, setImageSrc] = useState(null);
    const [size, setSize] = useState(60);
    const [animation, setAnimation] = useState('scale-rotate-left');
    const [inactiveBehavior, setInactiveBehavior] = useState('hidden');
    const fileInputRef = useRef(null);

    useEffect(() => {
        if (inactiveBehavior === 'dimmed' && !animation.startsWith('dim-')) {
            setAnimation('dim-scale-rotate-left');
        } else if (inactiveBehavior !== 'dimmed' && animation.startsWith('dim-')) {
            setAnimation('scale-rotate-left');
        }
    }, [inactiveBehavior, animation]);

    // Esc cancels placement mode
    useEffect(() => {
        if (!armedComponentId) return;
        const onKey = (e) => {
            if (e.key === 'Escape') setArmedComponentId(null);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [armedComponentId, setArmedComponentId]);

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (evt) => setImageSrc(evt.target.result);
            reader.readAsDataURL(file);
        }
    };

    const handlePaste = (e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (let index in items) {
            const item = items[index];
            if (item.kind === 'file') {
                const blob = item.getAsFile();
                const reader = new FileReader();
                reader.onload = (evt) => setImageSrc(evt.target.result);
                reader.readAsDataURL(blob);
            }
        }
    };

    const handleAdd = () => {
        if (!imageSrc) return;
        const newComp = {
            id: `comp_${Date.now()}`,
            src: imageSrc,
            size,
            animation,
            inactiveBehavior
        };
        setCustomComponents([...customComponents, newComp]);
        setImageSrc(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        // Arm the fresh element right away so the next click places it
        setArmedComponentId(newComp.id);
    };

    const handleDeleteFromLibrary = (e, id) => {
        e.stopPropagation();
        if (armedComponentId === id) setArmedComponentId(null);
        setCustomComponents(customComponents.filter(c => c.id !== id));
        // Strip any placed instances from all segments so no orphan tokens remain
        const tokenRe = new RegExp(`\\s*\\[COMP:${id}\\]\\s*`, 'g');
        setSegments(segments.map(seg =>
            seg.text.includes(`[COMP:${id}]`)
                ? { ...seg, text: seg.text.replace(tokenRe, ' ').replace(/  +/g, ' ').trim() }
                : seg
        ));
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="panel-header">
                <span className="panel-eyebrow">Elements</span>
                <h3 className="panel-title">Inline Images</h3>
                <p className="panel-subtitle">Images that pop in beside a word — emoji, logos, stickers.</p>
            </div>

            {armedComponentId && (
                <div className="armed-banner">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 18l6-6-6-6"></path>
                    </svg>
                    Click a word in the preview to place the image after it. Press Esc to cancel.
                </div>
            )}

            <div
                className="dropzone"
                onPaste={handlePaste}
                onClick={() => fileInputRef.current?.click()}
            >
                {imageSrc ? (
                    <img src={imageSrc} alt="Preview" />
                ) : (
                    <>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2"></rect>
                            <circle cx="8.5" cy="8.5" r="1.5"></circle>
                            <polyline points="21 15 16 10 5 21"></polyline>
                        </svg>
                        <span>Click to upload,<br />or paste an image (Ctrl+V)</span>
                    </>
                )}
                <input
                    type="file"
                    accept="image/*"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    onChange={handleFileUpload}
                />
            </div>

            <div className="field-row cols-2">
                <div className="field">
                    <label>Size (px)</label>
                    <input
                        type="number"
                        className="panel-input"
                        value={size}
                        onChange={(e) => setSize(parseInt(e.target.value) || 60)}
                    />
                </div>
                <div className="field">
                    <label>When inactive</label>
                    <select className="panel-select" value={inactiveBehavior} onChange={(e) => setInactiveBehavior(e.target.value)}>
                        <option value="hidden">Hide</option>
                        <option value="collapse">Collapse</option>
                        <option value="dimmed">Dim</option>
                    </select>
                </div>
            </div>

            <div className="field">
                <label>Entrance</label>
                <select className="panel-select" value={animation} onChange={(e) => setAnimation(e.target.value)}>
                    {inactiveBehavior === 'dimmed' ? (
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

            <button className="btn-primary" onClick={handleAdd} disabled={!imageSrc}>
                Add & Place
            </button>

            {customComponents.length > 0 && (
                <div style={{ paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <span className="panel-eyebrow" style={{ marginBottom: 0 }}>Library</span>
                    <div className="element-grid">
                        {customComponents.map(comp => (
                            <div
                                key={comp.id}
                                className={`element-tile ${armedComponentId === comp.id ? 'armed' : ''}`}
                                title={armedComponentId === comp.id ? 'Placing — click a word in the preview' : 'Click to place in preview'}
                                onClick={() => setArmedComponentId(armedComponentId === comp.id ? null : comp.id)}
                            >
                                <img src={comp.src} alt="element" />
                                <button
                                    className="element-tile-delete"
                                    title="Delete from library (removes it from the video)"
                                    onClick={(e) => handleDeleteFromLibrary(e, comp.id)}
                                >
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                    </svg>
                                </button>
                            </div>
                        ))}
                    </div>
                    <p className="field-hint" style={{ margin: 0 }}>Click an element, then click a word in the preview to place it.</p>
                </div>
            )}
        </div>
    );
};

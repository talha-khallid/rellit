import React, { useContext, useRef } from 'react';
import { EditorContext } from '../context/EditorContext';
import { CroppedImage } from './CroppedImage';
import { MediaCropModal } from './MediaCropModal';
import { clampMediaWindow, newMediaItemDefaults, cropOutputHeight } from '../utils/mediaLayout';

export const MediaLibrary = () => {
    const {
        mediaItems, setMediaItems,
        selectedMediaId, setSelectedMediaId,
        cropModalMediaId, setCropModalMediaId,
        visualLines, lineSettings,
        currentTimeRef
    } = useContext(EditorContext);

    const fileInputRef = useRef(null);

    const getTotalTime = () => visualLines.reduce((acc, _, i) => acc + parseFloat(lineSettings[i]?.duration || 0.1), 0);

    const addImage = (src) => {
        const totalTime = getTotalTime();
        const { start, duration } = clampMediaWindow(mediaItems, null, currentTimeRef.current || 0, 3, totalTime);
        const id = `bigimg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const newItem = { id, src, start, duration, ...newMediaItemDefaults() };
        setMediaItems([...mediaItems, newItem]);
        setSelectedMediaId(id);

        // Derive the height from the image's natural aspect (full crop) as soon
        // as it loads, so it isn't stretched at the placeholder height.
        const probe = new Image();
        probe.onload = () => {
            const h = cropOutputHeight(probe.naturalWidth, probe.naturalHeight, newItem.crop);
            setMediaItems(prev => prev.map(m => m.id === id ? { ...m, height: h } : m));
        };
        probe.src = src;
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => addImage(evt.target.result);
        reader.readAsDataURL(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handlePaste = (e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (let index in items) {
            const item = items[index];
            if (item.kind === 'file') {
                const blob = item.getAsFile();
                const reader = new FileReader();
                reader.onload = (evt) => addImage(evt.target.result);
                reader.readAsDataURL(blob);
            }
        }
    };

    const updateItem = (id, patch) => {
        setMediaItems(mediaItems.map(m => m.id === id ? { ...m, ...patch } : m));
    };

    const updateWindow = (id, newStart, newDuration) => {
        const totalTime = getTotalTime();
        const { start, duration } = clampMediaWindow(mediaItems, id, newStart, newDuration, totalTime);
        setMediaItems(mediaItems.map(m => m.id === id ? { ...m, start, duration } : m));
    };

    const handleDelete = (id) => {
        setMediaItems(mediaItems.filter(m => m.id !== id));
        if (selectedMediaId === id) setSelectedMediaId(null);
        if (cropModalMediaId === id) setCropModalMediaId(null);
    };

    const sorted = [...mediaItems].sort((a, b) => a.start - b.start);
    const cropItem = cropModalMediaId ? mediaItems.find(m => m.id === cropModalMediaId) : null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="panel-header">
                <span className="panel-eyebrow">Scenes</span>
                <h3 className="panel-title">Big Images</h3>
                <p className="panel-subtitle">Full-width photos that appear behind the captions — great for showing what you're talking about.</p>
            </div>

            <div
                className="dropzone"
                onPaste={handlePaste}
                onClick={() => fileInputRef.current?.click()}
            >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"></rect>
                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
                <span>Click to upload,<br />or paste an image (Ctrl+V)</span>
                <input
                    type="file"
                    accept="image/*"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    onChange={handleFileUpload}
                />
            </div>

            {sorted.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0', lineHeight: 1.6 }}>
                    No big images yet.<br />Add one above — it'll drop in at the playhead.
                </p>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {sorted.map(item => {
                        const isSelected = selectedMediaId === item.id;
                        return (
                            <div key={item.id} className={`comp-card ${isSelected ? 'selected' : ''}`}>
                                <div
                                    className="comp-card-head"
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => setSelectedMediaId(isSelected ? null : item.id)}
                                >
                                    <div className="comp-thumb">
                                        <CroppedImage src={item.src} boxW={30} boxH={30} crop={item.crop} />
                                    </div>
                                    <span className="comp-card-title">{item.start.toFixed(1)}s – {(item.start + item.duration).toFixed(1)}s</span>
                                    <button className="icon-btn danger" title="Delete" onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}>
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="3 6 5 6 21 6"></polyline>
                                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                        </svg>
                                    </button>
                                </div>

                                {isSelected && (
                                    <div className="comp-card-body">
                                        <div className="field-row cols-2">
                                            <div className="field">
                                                <label>Start (s)</label>
                                                <input
                                                    type="number" step="0.1" className="panel-input"
                                                    value={item.start}
                                                    onChange={e => updateWindow(item.id, parseFloat(e.target.value) || 0, item.duration)}
                                                />
                                            </div>
                                            <div className="field">
                                                <label>Duration (s)</label>
                                                <input
                                                    type="number" step="0.1" className="panel-input"
                                                    value={item.duration}
                                                    onChange={e => updateWindow(item.id, item.start, parseFloat(e.target.value) || 0.2)}
                                                />
                                            </div>
                                        </div>
                                        <button className="btn-ghost" style={{ height: 34, width: '100%' }} onClick={() => setCropModalMediaId(item.id)}>
                                            Crop & style image
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {cropItem && (
                <MediaCropModal
                    item={cropItem}
                    onChange={(patch) => updateItem(cropItem.id, patch)}
                    onClose={() => setCropModalMediaId(null)}
                />
            )}
        </div>
    );
};

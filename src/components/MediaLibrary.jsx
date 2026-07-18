import React, { useContext, useRef } from 'react';
import { EditorContext } from '../context/EditorContext';
import { CroppedMedia } from './CroppedMedia';
import { MediaCropModal } from './MediaCropModal';
import { MediaTrimModal } from './MediaTrimModal';
import { clampMediaWindow, newMediaItemDefaults, cropOutputHeight, keyframeAt, newKeyframe, normalizeKeyframe, sampleKeyframes, clamp, MEDIA_MAX_ZOOM } from '../utils/mediaLayout';

export const MediaLibrary = () => {
    const {
        mediaItems, setMediaItems,
        selectedMediaId, setSelectedMediaId,
        cropModalMediaId, setCropModalMediaId,
        trimModalMediaId, setTrimModalMediaId,
        selectedKeyframeId, setSelectedKeyframeId,
        visualLines, lineSettings,
        currentTimeRef, setCurrentLineIndex, timelineScale
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

    const addVideo = (src) => {
        // Read the video's intrinsic size + length before placing it, so the block
        // gets the right aspect and defaults to the clip's own duration.
        const probe = document.createElement('video');
        probe.preload = 'metadata';
        probe.onloadedmetadata = () => {
            const totalTime = getTotalTime();
            const natW = probe.videoWidth || 16;
            const natH = probe.videoHeight || 9;
            const vidDur = (isFinite(probe.duration) && probe.duration > 0) ? probe.duration : 5;
            const desired = Math.min(vidDur, Math.max(1, totalTime || vidDur));
            const { start, duration } = clampMediaWindow(mediaItems, null, currentTimeRef.current || 0, desired, totalTime);
            const id = `bigvid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const height = cropOutputHeight(natW, natH, { x: 0, y: 0, w: 1, h: 1 });
            const newItem = {
                id, ...newMediaItemDefaults('video'),
                src, start, duration, height,
                videoDuration: vidDur, trimStart: 0, audioEnabled: false
            };
            setMediaItems(prev => [...prev, newItem]);
            setSelectedMediaId(id);
            // If the clip is longer than the caption timeline, make the user trim it.
            if (totalTime > 0 && vidDur > totalTime + 0.05) setTrimModalMediaId(id);
        };
        probe.onerror = () => { /* not a decodable video — ignore */ };
        probe.src = src;
    };

    const addFile = (file, dataUrl) => {
        if (file && file.type && file.type.startsWith('video')) addVideo(dataUrl);
        else addImage(dataUrl);
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => addFile(file, evt.target.result);
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
                reader.onload = (evt) => addFile(blob, evt.target.result);
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

    // Trim popup changes: trimStart/audioEnabled are plain, but a duration change
    // must be re-fit against the other items on the timeline.
    const updateTrim = (id, patch) => {
        setMediaItems(prev => prev.map(m => {
            if (m.id !== id) return m;
            const merged = { ...m, ...patch };
            if ('duration' in patch) {
                const totalTime = getTotalTime();
                const { start, duration } = clampMediaWindow(prev, id, merged.start, merged.duration, totalTime);
                return { ...merged, start, duration };
            }
            return merged;
        }));
    };

    const handleDelete = (id) => {
        setMediaItems(mediaItems.filter(m => m.id !== id));
        if (selectedMediaId === id) setSelectedMediaId(null);
        if (cropModalMediaId === id) setCropModalMediaId(null);
        if (trimModalMediaId === id) setTrimModalMediaId(null);
    };

    // --- Motion keyframes ----------------------------------------------------
    const seekToTime = (time) => {
        const t = Math.max(0, time);
        currentTimeRef.current = t;
        let acc = 0, idx = 0;
        for (let i = 0; i < visualLines.length; i++) {
            const d = parseFloat(lineSettings[i]?.duration || 0.1);
            if (t >= acc && t < acc + d) { idx = i; break; }
            acc += d; idx = i;
        }
        setCurrentLineIndex(idx);
        window.dispatchEvent(new CustomEvent('timeupdate-seek'));
    };

    const updateKf = (itemId, kfId, patch) => {
        setMediaItems(mediaItems.map(m => m.id === itemId
            ? { ...m, keyframes: (m.keyframes || []).map(k => k.id === kfId ? normalizeKeyframe({ ...k, ...patch }) : k) }
            : m));
    };

    const deleteKf = (itemId, kfId) => {
        setMediaItems(mediaItems.map(m => m.id === itemId
            ? { ...m, keyframes: (m.keyframes || []).filter(k => k.id !== kfId) } : m));
        if (selectedKeyframeId === kfId) setSelectedKeyframeId(null);
    };

    const addKeyframeAtPlayhead = (item) => {
        const tAbs = currentTimeRef.current;
        // Clamp the playhead into the image's window so the keyframe always lands
        // somewhere valid even if the playhead is currently outside it.
        const tAbsClamped = Math.min(Math.max(tAbs, item.start), item.start + item.duration);
        const tNorm = item.duration > 0 ? (tAbsClamped - item.start) / item.duration : 0;
        const tEps = clamp((6 / timelineScale) / (item.duration || 1), 0.002, 0.06);
        const existing = keyframeAt(item.keyframes || [], tNorm, tEps);
        if (existing) { setSelectedKeyframeId(existing.id); seekToTime(item.start + existing.t * item.duration); return; }
        const kf = newKeyframe(tNorm, sampleKeyframes(item.keyframes, tNorm));
        setMediaItems(mediaItems.map(m => m.id === item.id ? { ...m, keyframes: [...(m.keyframes || []), kf] } : m));
        setSelectedKeyframeId(kf.id);
        seekToTime(item.start + tNorm * item.duration);
    };

    const sorted = [...mediaItems].sort((a, b) => a.start - b.start);
    const cropItem = cropModalMediaId ? mediaItems.find(m => m.id === cropModalMediaId) : null;
    const trimItem = trimModalMediaId ? mediaItems.find(m => m.id === trimModalMediaId && m.type === 'video') : null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="panel-header">
                <span className="panel-eyebrow">Scenes</span>
                <h3 className="panel-title">Big Media</h3>
                <p className="panel-subtitle">Full-width photos or videos that appear with the captions — great for showing what you're talking about.</p>
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
                <span>Click to upload an image or video,<br />or paste an image (Ctrl+V)</span>
                <input
                    type="file"
                    accept="image/*,video/*"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    onChange={handleFileUpload}
                />
            </div>

            {sorted.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0', lineHeight: 1.6 }}>
                    No media yet.<br />Add an image or video above — it'll drop in at the playhead.
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
                                        <CroppedMedia item={item} boxW={30} boxH={30} />
                                        {item.type === 'video' && <span className="thumb-video-badge">▶</span>}
                                    </div>
                                    <span className="comp-card-title">
                                        {item.start.toFixed(1)}s – {(item.start + item.duration).toFixed(1)}s
                                        {item.keyframes?.length > 0 && (
                                            <span className="motion-badge" title={`${item.keyframes.length} motion keyframe${item.keyframes.length > 1 ? 's' : ''}`}>⤢ {item.keyframes.length}</span>
                                        )}
                                    </span>
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
                                            Crop &amp; style
                                        </button>

                                        {item.type === 'video' && (
                                            <>
                                                <button className="btn-ghost" style={{ height: 34, width: '100%' }} onClick={() => setTrimModalMediaId(item.id)}>
                                                    Trim video
                                                </button>
                                                <label className="media-audio-toggle">
                                                    <input
                                                        type="checkbox"
                                                        checked={!!item.audioEnabled}
                                                        onChange={e => updateItem(item.id, { audioEnabled: e.target.checked })}
                                                    />
                                                    Play video audio
                                                </label>
                                            </>
                                        )}

                                        {/* Motion (pan/zoom keyframes) */}
                                        {(() => {
                                            const kfs = [...(item.keyframes || [])].sort((a, b) => a.t - b.t);
                                            const selKf = kfs.find(k => k.id === selectedKeyframeId) || null;
                                            return (
                                                <div className="motion-section">
                                                    <div className="motion-head">
                                                        <span>Motion</span>
                                                        <button className="btn-mini" onClick={() => addKeyframeAtPlayhead(item)}>+ Keyframe</button>
                                                    </div>

                                                    {kfs.length === 0 ? (
                                                        <p className="motion-hint">
                                                            Move the playhead, then drag the image in the preview to pan (scroll to zoom) — or hit <b>+ Keyframe</b> / <b>K</b>. Add 2+ to create motion.
                                                        </p>
                                                    ) : (
                                                        <>
                                                            <div className="kf-chip-row">
                                                                {kfs.map(kf => (
                                                                    <button
                                                                        key={kf.id}
                                                                        className={`kf-chip ${selectedKeyframeId === kf.id ? 'selected' : ''}`}
                                                                        onClick={() => { setSelectedKeyframeId(kf.id); seekToTime(item.start + kf.t * item.duration); }}
                                                                    >
                                                                        {(kf.t * item.duration).toFixed(1)}s · {kf.scale.toFixed(1)}x
                                                                    </button>
                                                                ))}
                                                            </div>

                                                            {selKf ? (
                                                                <>
                                                                    <div className="field-row cols-2">
                                                                        <div className="field">
                                                                            <label>Time (s)</label>
                                                                            <input
                                                                                type="number" step="0.1" min="0" max={item.duration} className="panel-input"
                                                                                value={(selKf.t * item.duration).toFixed(2)}
                                                                                onChange={e => updateKf(item.id, selKf.id, { t: item.duration > 0 ? clamp((parseFloat(e.target.value) || 0) / item.duration, 0, 1) : 0 })}
                                                                            />
                                                                        </div>
                                                                        <div className="field">
                                                                            <label>Zoom ({selKf.scale.toFixed(2)}x)</label>
                                                                            <input
                                                                                type="range" min="1" max={MEDIA_MAX_ZOOM} step="0.01"
                                                                                value={selKf.scale}
                                                                                onChange={e => updateKf(item.id, selKf.id, { scale: parseFloat(e.target.value) })}
                                                                                style={{ width: '100%' }}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                    <button className="btn-ghost danger-ghost" style={{ height: 30, width: '100%' }} onClick={() => deleteKf(item.id, selKf.id)}>
                                                                        Delete keyframe
                                                                    </button>
                                                                </>
                                                            ) : (
                                                                <p className="motion-hint">Click a keyframe (chip above or diamond on the timeline) to edit its zoom &amp; position.</p>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            );
                                        })()}
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

            {trimItem && (
                <MediaTrimModal
                    item={trimItem}
                    editingDuration={getTotalTime()}
                    onChange={(patch) => updateTrim(trimItem.id, patch)}
                    onClose={() => setTrimModalMediaId(null)}
                />
            )}
        </div>
    );
};

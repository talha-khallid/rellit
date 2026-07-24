import React, { useContext, useRef, useState, useEffect } from 'react';
import { EditorContext } from '../context/EditorContext';
import { CroppedMedia } from './CroppedMedia';
import { MediaCropModal } from './MediaCropModal';
import { clampMediaWindow, newMediaItemDefaults, cropOutputBox, keyframeAt, newKeyframe, normalizeKeyframe, sampleKeyframes, clamp, MEDIA_MAX_ZOOM, minViewScale } from '../utils/mediaLayout';

// A free-form video-speed input (no fixed presets). The value is buffered locally
// so typing "1.5" doesn't rescale the clip on every keystroke; it commits on blur
// or Enter. The hint shows the resulting on-timeline length live as you type —
// source length is fixed, so faster speed ⇒ shorter clip.
const VideoSpeedField = ({ item, onCommit }) => {
    const speed = item.speed || 1;
    const [draft, setDraft] = useState(String(speed));
    useEffect(() => { setDraft(String(item.speed || 1)); }, [item.speed]);

    const commit = () => {
        const v = parseFloat(draft);
        if (!isFinite(v) || v <= 0) { setDraft(String(item.speed || 1)); return; }
        onCommit(v);
    };

    const sourceLen = item.duration * speed;                 // source seconds shown (invariant)
    const draftSpeed = parseFloat(draft);
    const validDraft = isFinite(draftSpeed) && draftSpeed > 0;
    const previewLen = validDraft ? sourceLen / clamp(draftSpeed, 0.1, 16) : item.duration;

    return (
        <div className="field">
            <label>Speed (×)</label>
            <input
                type="number" step="0.05" min="0.1" max="16" className="panel-input"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={e => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    else if (e.key === 'Escape') { setDraft(String(item.speed || 1)); e.currentTarget.blur(); }
                }}
            />
            <p className="motion-hint" style={{ marginTop: 6 }}>
                {sourceLen.toFixed(1)}s of video → plays as <b>{previewLen.toFixed(1)}s</b> at {validDraft ? +draftSpeed.toFixed(2) : speed}× speed
            </p>
        </div>
    );
};

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

        // Derive the box (width/height) from the image's natural aspect as soon
        // as it loads, so it isn't stretched at the placeholder size.
        const probe = new Image();
        probe.onload = () => {
            const box = cropOutputBox(probe.naturalWidth, probe.naturalHeight, newItem.crop);
            setMediaItems(prev => prev.map(m => m.id === id ? { ...m, width: box.width, height: box.height } : m));
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
            const box = cropOutputBox(natW, natH, { x: 0, y: 0, w: 1, h: 1 });
            const newItem = {
                id, ...newMediaItemDefaults('video'),
                src, start, duration, width: box.width, height: box.height,
                videoDuration: vidDur, trimStart: 0, audioEnabled: false, speed: 1
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

    // Re-upload the source of an EXISTING media item. Keeps all its settings and
    // placement — crop frame, motion keyframes, start/duration, border radius and
    // transition — and only re-fits the box height to the new file's aspect (so it
    // isn't distorted). A type change (image↔video) additionally adds/removes the
    // video-only fields (videoDuration / trimStart / audioEnabled).
    const replaceMedia = (id, file, dataUrl) => {
        const item = mediaItems.find(m => m.id === id);
        if (!item) return;
        const isVideo = !!(file && file.type && file.type.startsWith('video'));

        if (isVideo) {
            const probe = document.createElement('video');
            probe.preload = 'metadata';
            probe.onloadedmetadata = () => {
                const natW = probe.videoWidth || 16, natH = probe.videoHeight || 9;
                const vidDur = (isFinite(probe.duration) && probe.duration > 0) ? probe.duration : 5;
                setMediaItems(prev => prev.map(m => {
                    if (m.id !== id) return m;
                    const box = cropOutputBox(natW, natH, m.crop);
                    const wasVideo = m.type === 'video';
                    const speed = wasVideo ? (m.speed || 1) : 1;
                    const trimStart = wasVideo ? clamp(m.trimStart || 0, 0, Math.max(0, vidDur - 0.1)) : 0;
                    return {
                        ...m, type: 'video', src: dataUrl,
                        width: box.width, height: box.height,
                        videoDuration: vidDur, trimStart, speed,
                        // Cap timeline length to the source available at this speed
                        // (source consumed = duration × speed).
                        duration: Math.max(0.2, Math.min(m.duration, (vidDur - trimStart) / speed)),
                        audioEnabled: wasVideo ? !!m.audioEnabled : false
                    };
                }));
            };
            probe.onerror = () => { /* not a decodable video — leave the item unchanged */ };
            probe.src = dataUrl;
        } else {
            const probe = new Image();
            probe.onload = () => {
                setMediaItems(prev => prev.map(m => {
                    if (m.id !== id) return m;
                    const box = cropOutputBox(probe.naturalWidth, probe.naturalHeight, m.crop);
                    // Drop video-only fields when switching a video → image.
                    const { videoDuration, trimStart, audioEnabled, ...rest } = m;
                    return { ...rest, type: 'image', src: dataUrl, width: box.width, height: box.height };
                }));
            };
            probe.onerror = () => {};
            probe.src = dataUrl;
        }
    };

    const handleReplaceUpload = (id, e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => replaceMedia(id, file, evt.target.result);
        reader.readAsDataURL(file);
        e.target.value = '';
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

    // Change a video's playback speed while keeping the SAME slice of source in
    // play: source consumed = duration × speed, so holding that constant means the
    // on-timeline length becomes (source / newSpeed). Faster ⇒ shorter clip. The
    // result is re-clamped against the timeline/neighbours, so the length shown is
    // the real one.
    const changeSpeed = (id, rawSpeed) => {
        const newSpeed = clamp(Number(rawSpeed) || 1, 0.1, 16);
        const item = mediaItems.find(m => m.id === id);
        if (!item) return;
        const oldSpeed = item.speed || 1;
        const sourceLen = item.duration * oldSpeed;              // source seconds shown
        const totalTime = getTotalTime();
        const { start, duration } = clampMediaWindow(mediaItems, id, item.start, sourceLen / newSpeed, totalTime);
        setMediaItems(mediaItems.map(m => m.id === id ? { ...m, speed: newSpeed, start, duration } : m));
    };

    // Edits from the media popup. A duration change (trim) must be re-fit against
    // the other items on the timeline; everything else is a plain merge.
    const onEditChange = (id, patch) => {
        if ('duration' in patch) {
            setMediaItems(prev => prev.map(m => {
                if (m.id !== id) return m;
                const merged = { ...m, ...patch };
                const totalTime = getTotalTime();
                const { start, duration } = clampMediaWindow(prev, id, merged.start, merged.duration, totalTime);
                return { ...merged, start, duration };
            }));
        } else {
            updateItem(id, patch);
        }
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
            ? { ...m, keyframes: (m.keyframes || []).map(k => k.id === kfId ? normalizeKeyframe({ ...k, ...patch }, m.crop) : k) }
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
        const kf = newKeyframe(tNorm, sampleKeyframes(item.keyframes, tNorm, item.crop), item.crop);
        setMediaItems(mediaItems.map(m => m.id === item.id ? { ...m, keyframes: [...(m.keyframes || []), kf] } : m));
        setSelectedKeyframeId(kf.id);
        seekToTime(item.start + tNorm * item.duration);
    };

    const sorted = [...mediaItems].sort((a, b) => a.start - b.start);
    // One popup, opened on the Crop or Trim tab depending on which trigger fired.
    const editId = trimModalMediaId || cropModalMediaId;
    const editItem = editId ? mediaItems.find(m => m.id === editId) : null;
    const closeEdit = () => { setCropModalMediaId(null); setTrimModalMediaId(null); };

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
                                    <button
                                        className="icon-btn"
                                        title="Replace media (keeps crop, motion & placement)"
                                        onClick={(e) => { e.stopPropagation(); document.getElementById(`media-replace-${item.id}`).click(); }}
                                    >
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                            <polyline points="17 8 12 3 7 8"></polyline>
                                            <line x1="12" y1="3" x2="12" y2="15"></line>
                                        </svg>
                                    </button>
                                    <input
                                        id={`media-replace-${item.id}`}
                                        type="file"
                                        accept="image/*,video/*"
                                        style={{ display: 'none' }}
                                        onChange={(e) => handleReplaceUpload(item.id, e)}
                                    />
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
                                            {item.type === 'video' ? 'Crop & trim' : 'Crop & style'}
                                        </button>

                                        {item.type === 'video' && (
                                            <VideoSpeedField item={item} onCommit={(v) => changeSpeed(item.id, v)} />
                                        )}

                                        {item.type === 'video' && (
                                            <label className="switch-row">
                                                <span className="switch-label">
                                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M11 5 6 9H2v6h4l5 4z"></path>
                                                        <path d="M15.5 8.5a5 5 0 0 1 0 7"></path>
                                                        <path d="M19 5a10 10 0 0 1 0 14"></path>
                                                    </svg>
                                                    Video audio
                                                </span>
                                                <span className="switch">
                                                    <input
                                                        type="checkbox"
                                                        checked={!!item.audioEnabled}
                                                        onChange={e => updateItem(item.id, { audioEnabled: e.target.checked })}
                                                    />
                                                    <span className="switch-slider"></span>
                                                </span>
                                            </label>
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
                                                                                type="range" min={minViewScale(item.crop)} max={MEDIA_MAX_ZOOM} step="0.01"
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

            {editItem && (
                <MediaCropModal
                    item={editItem}
                    editingDuration={getTotalTime()}
                    initialTab={trimModalMediaId ? 'trim' : 'crop'}
                    onChange={(patch) => onEditChange(editItem.id, patch)}
                    onClose={closeEdit}
                />
            )}
        </div>
    );
};

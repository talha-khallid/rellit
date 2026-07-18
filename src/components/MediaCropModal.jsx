import React, { useState, useRef, useEffect } from 'react';
import { clamp, normalizeCrop, cropOutputBox } from '../utils/mediaLayout';

const STAGE_MAX_W = 320;
const STAGE_MAX_H = 340;
const MIN_CROP = 0.05; // smallest crop, as a fraction of the media

// Unified media editor. Images get a single Crop tab; videos also get a Trim tab.
// All continuous drags are buffered in LOCAL state and only committed to the app
// on release, so dragging never re-renders the (heavy) editor/preview per frame.
export const MediaCropModal = ({ item, editingDuration = 0, initialTab = 'crop', onChange, onClose }) => {
    const isVideo = item.type === 'video';
    const [tab, setTab] = useState(isVideo && initialTab === 'trim' ? 'trim' : 'crop');

    // ============================ CROP ============================
    const [natural, setNatural] = useState(null);
    const stageRef = useRef(null);
    const cropDragRef = useRef(null);
    const [cropDragging, setCropDragging] = useState(false);

    const [draftCrop, setDraftCrop] = useState(() => normalizeCrop(item.crop));
    const draftCropRef = useRef(draftCrop);
    // Resync when the committed crop changes (fires after our own commit too — a
    // no-op then). Never runs mid-drag since a drag only touches local state.
    useEffect(() => {
        const nc = normalizeCrop(item.crop);
        draftCropRef.current = nc;
        setDraftCrop(nc);
    }, [item.crop]);

    let stageW = STAGE_MAX_W, stageH = STAGE_MAX_H;
    if (natural) {
        const s = Math.min(STAGE_MAX_W / natural.w, STAGE_MAX_H / natural.h);
        stageW = natural.w * s; stageH = natural.h * s;
    }

    const setCropDraft = (nc) => { const n = normalizeCrop(nc); draftCropRef.current = n; setDraftCrop(n); };
    const commitCrop = () => {
        const nc = draftCropRef.current;
        const patch = { crop: nc };
        if (natural) { const box = cropOutputBox(natural.w, natural.h, nc); patch.width = box.width; patch.height = box.height; }
        onChange(patch);
    };

    useEffect(() => {
        if (!cropDragging) return;
        const move = (e) => {
            const d = cropDragRef.current;
            if (!d) return;
            const dx = (e.clientX - d.startX) / stageW;
            const dy = (e.clientY - d.startY) / stageH;
            const s = d.startCrop;
            let { x, y, w, h } = s;
            if (d.mode === 'move') {
                x = clamp(s.x + dx, 0, 1 - s.w);
                y = clamp(s.y + dy, 0, 1 - s.h);
            } else {
                let l = s.x, t = s.y, r = s.x + s.w, b = s.y + s.h;
                if (d.mode.includes('w')) l = clamp(s.x + dx, 0, r - MIN_CROP);
                if (d.mode.includes('e')) r = clamp(s.x + s.w + dx, l + MIN_CROP, 1);
                if (d.mode.includes('n')) t = clamp(s.y + dy, 0, b - MIN_CROP);
                if (d.mode.includes('s')) b = clamp(s.y + s.h + dy, t + MIN_CROP, 1);
                x = l; y = t; w = r - l; h = b - t;
            }
            setCropDraft({ x, y, w, h });
        };
        const up = () => { setCropDragging(false); commitCrop(); };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
        return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cropDragging, stageW, stageH, natural]);

    const startCropDrag = (mode) => (e) => {
        e.preventDefault(); e.stopPropagation();
        cropDragRef.current = { mode, startX: e.clientX, startY: e.clientY, startCrop: draftCropRef.current };
        setCropDragging(true);
    };

    const cropBox = { left: draftCrop.x * stageW, top: draftCrop.y * stageH, width: draftCrop.w * stageW, height: draftCrop.h * stageH };
    const handles = ['nw', 'ne', 'sw', 'se'];

    // ============================ TRIM ============================
    const videoRef = useRef(null);
    const trackRef = useRef(null);
    const playheadRef = useRef(null);
    const timeTextRef = useRef(null);
    const [vidDur, setVidDur] = useState(item.videoDuration || 0);
    const [playing, setPlaying] = useState(false);

    const maxLen = Math.min(editingDuration || vidDur || 0, vidDur || 0) || (item.videoDuration || 0);
    const minLen = Math.min(0.5, maxLen || 0.5);

    const [draftTrim, setDraftTrim] = useState({ start: item.trimStart || 0, len: item.duration || 0 });
    const draftTrimRef = useRef(draftTrim);
    useEffect(() => {
        const nt = { start: item.trimStart || 0, len: item.duration || 0 };
        draftTrimRef.current = nt;
        setDraftTrim(nt);
    }, [item.trimStart, item.duration]);

    const trimStart = clamp(draftTrim.start, 0, Math.max(0, vidDur - minLen));
    const length = clamp(draftTrim.len || maxLen, minLen, Math.max(minLen, Math.min(maxLen, vidDur - trimStart)));
    const trimEnd = trimStart + length;
    const pct = (t) => (vidDur > 0 ? (t / vidDur) * 100 : 0);

    const setTrimDraft = (start, len) => {
        const s = clamp(start, 0, Math.max(0, vidDur - minLen));
        const l = clamp(len, minLen, Math.max(minLen, Math.min(maxLen, vidDur - s)));
        const nt = { start: s, len: l };
        draftTrimRef.current = nt;
        setDraftTrim(nt);
    };
    const commitTrim = () => { const { start, len } = draftTrimRef.current; onChange({ trimStart: start, duration: len }); };
    const applyTrim = (start, len) => { setTrimDraft(start, len); const t = draftTrimRef.current; onChange({ trimStart: t.start, duration: t.len }); };

    const trimDragRef = useRef(null);
    const [trimDragging, setTrimDragging] = useState(false);
    useEffect(() => {
        if (!trimDragging) return;
        const move = (e) => {
            const d = trimDragRef.current;
            if (!d) return;
            const dt = ((e.clientX - d.startX) / d.w) * vidDur;
            if (d.mode === 'move') setTrimDraft(d.s + dt, d.l);
            else if (d.mode === 'left') { const end = d.s + d.l; const ns = clamp(d.s + dt, 0, end - minLen); setTrimDraft(ns, end - ns); }
            else if (d.mode === 'right') setTrimDraft(d.s, d.l + dt);
        };
        const up = () => { setTrimDragging(false); commitTrim(); };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
        return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [trimDragging, vidDur, minLen, maxLen]);

    const startTrimDrag = (mode) => (e) => {
        e.preventDefault(); e.stopPropagation();
        trimDragRef.current = { mode, startX: e.clientX, s: trimStart, l: length, w: trackRef.current?.clientWidth || 1 };
        setTrimDragging(true);
    };

    // Reflect the audio toggle on the popup's own <video>.
    useEffect(() => { const v = videoRef.current; if (v) v.muted = !item.audioEnabled; }, [item.audioEnabled, tab]);

    // Imperative playhead + loop within the trim window — no per-frame re-render.
    const boundsRef = useRef({});
    boundsRef.current = { start: trimStart, end: trimEnd, vidDur };
    useEffect(() => {
        if (tab !== 'trim') return;
        let raf;
        const loop = () => {
            const v = videoRef.current;
            if (v) {
                const b = boundsRef.current;
                if (!v.paused && (v.currentTime >= b.end - 0.02 || v.currentTime < b.start - 0.06)) {
                    try { v.currentTime = b.start; } catch (e) { /* seek race */ }
                }
                if (playheadRef.current) playheadRef.current.style.left = (b.vidDur > 0 ? (v.currentTime / b.vidDur) * 100 : 0) + '%';
                if (timeTextRef.current) timeTextRef.current.textContent = v.currentTime.toFixed(1) + 's';
            }
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, [tab]);

    const togglePlay = () => {
        const v = videoRef.current;
        if (!v) return;
        if (v.paused) {
            if (v.currentTime < trimStart || v.currentTime >= trimEnd) { try { v.currentTime = trimStart; } catch (e) { /* */ } }
            const p = v.play(); if (p && p.catch) p.catch(() => {});
        } else v.pause();
    };

    const seekTrack = (e) => {
        if (e.target.closest('.trim-window')) return;
        const rect = trackRef.current.getBoundingClientRect();
        const t = clamp(((e.clientX - rect.left) / rect.width) * vidDur, 0, vidDur);
        const v = videoRef.current;
        if (v) v.currentTime = t;
    };

    // Space toggles the POPUP video (not the main preview); Esc closes. Capture
    // phase so it wins over the app-level Space handler (which also bails while a
    // modal overlay is open).
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') { onClose(); return; }
            if (tab === 'trim' && (e.code === 'Space' || e.key === ' ')) {
                const t = (document.activeElement?.tagName || '').toLowerCase();
                if (t === 'input' || t === 'textarea') return;
                e.preventDefault();
                e.stopImmediatePropagation();
                togglePlay();
            }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, onClose, trimStart, trimEnd]);

    return (
        <div className="export-modal-overlay" onClick={onClose}>
            <div className={`export-modal ${isVideo ? 'media-edit-modal' : 'crop-modal'}`} onClick={e => e.stopPropagation()}>
                {isVideo ? (
                    <div className="crop-tabs">
                        <button className={`crop-tab ${tab === 'crop' ? 'active' : ''}`} onClick={() => setTab('crop')}>Crop &amp; style</button>
                        <button className={`crop-tab ${tab === 'trim' ? 'active' : ''}`} onClick={() => setTab('trim')}>Trim</button>
                    </div>
                ) : (
                    <h3>Crop Image</h3>
                )}

                {tab === 'crop' ? (
                    <>
                        <p className="export-modal-sub">Drag the box to move it, or its corners to resize. The output keeps this crop's shape.</p>

                        <div className="crop-stage-wrap">
                            <div ref={stageRef} className="crop-stage" style={{ width: stageW, height: stageH }}>
                                {isVideo ? (
                                    <video
                                        src={item.src}
                                        muted playsInline preload="auto"
                                        onLoadedMetadata={e => { setNatural({ w: e.target.videoWidth, h: e.target.videoHeight }); try { e.target.currentTime = item.trimStart || 0; } catch (err) { /* */ } }}
                                        style={{ width: '100%', height: '100%', display: 'block', userSelect: 'none' }}
                                    />
                                ) : (
                                    <img
                                        src={item.src}
                                        alt=""
                                        draggable={false}
                                        onLoad={e => setNatural({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
                                        style={{ width: '100%', height: '100%', display: 'block', userSelect: 'none' }}
                                    />
                                )}
                                <div
                                    className="crop-box"
                                    style={{ left: cropBox.left, top: cropBox.top, width: cropBox.width, height: cropBox.height, cursor: cropDragging ? 'grabbing' : 'grab' }}
                                    onMouseDown={startCropDrag('move')}
                                >
                                    {handles.map(h => (
                                        <div key={h} className={`crop-handle crop-handle-${h}`} onMouseDown={startCropDrag(h)} />
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="export-modal-body">
                            <label>Corner radius</label>
                            <input
                                type="number"
                                className="panel-input"
                                value={item.borderRadius ?? 24}
                                onChange={e => onChange({ borderRadius: Math.max(0, parseInt(e.target.value) || 0) })}
                            />
                        </div>

                        <div className="export-modal-footer">
                            <button className="btn-ghost" onClick={() => { const full = { x: 0, y: 0, w: 1, h: 1 }; setCropDraft(full); const box = natural ? cropOutputBox(natural.w, natural.h, full) : null; onChange({ crop: full, ...(box ? { width: box.width, height: box.height } : {}) }); }}>Reset crop</button>
                            <button className="btn-export-start" onClick={onClose}>Done</button>
                        </div>
                    </>
                ) : (
                    <>
                        <p className="export-modal-sub">Trim your clip to fit the caption timeline. The selection can be at most {maxLen.toFixed(1)}s. Press Space to play.</p>

                        <div className="trim-video-wrap">
                            <video
                                ref={videoRef}
                                src={item.src}
                                playsInline
                                onLoadedMetadata={e => { setVidDur(e.target.duration || item.videoDuration || 0); try { e.target.currentTime = trimStart; } catch (err) { /* */ } }}
                                onPlay={() => setPlaying(true)}
                                onPause={() => setPlaying(false)}
                            />
                        </div>

                        <div className="trim-controls-row">
                            <button className="trim-play-btn" onClick={togglePlay} title={playing ? 'Pause' : 'Play'}>
                                {playing
                                    ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zm8 0h4v14h-4z" /></svg>
                                    : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>}
                            </button>
                            <span className="trim-time" ref={timeTextRef}>0.0s</span>
                            <span className="trim-sel">Selected {length.toFixed(1)}s · max {maxLen.toFixed(1)}s</span>
                        </div>

                        <div className="trim-track" ref={trackRef} onMouseDown={seekTrack}>
                            <div
                                className="trim-window"
                                style={{ left: `${pct(trimStart)}%`, width: `${pct(length)}%`, cursor: trimDragging ? 'grabbing' : 'grab' }}
                                onMouseDown={startTrimDrag('move')}
                            >
                                <div className="trim-handle left" onMouseDown={startTrimDrag('left')} />
                                <div className="trim-handle right" onMouseDown={startTrimDrag('right')} />
                            </div>
                            <div className="trim-playhead" ref={playheadRef} style={{ left: `${pct(trimStart)}%` }} />
                        </div>

                        <div className="trim-fields">
                            <div className="field">
                                <label>Start (s)</label>
                                <input
                                    type="number" step="0.1" min="0" max={vidDur} className="panel-input"
                                    value={trimStart.toFixed(2)}
                                    onChange={e => applyTrim(parseFloat(e.target.value) || 0, length)}
                                />
                            </div>
                            <div className="field">
                                <label>Length (s)</label>
                                <input
                                    type="number" step="0.1" min="0" max={maxLen} className="panel-input"
                                    value={length.toFixed(2)}
                                    onChange={e => applyTrim(trimStart, parseFloat(e.target.value) || minLen)}
                                />
                            </div>
                        </div>

                        <div className="export-modal-footer" style={{ justifyContent: 'space-between' }}>
                            <label className="switch-row">
                                <span className="switch-label">Play video audio</span>
                                <span className="switch">
                                    <input type="checkbox" checked={!!item.audioEnabled} onChange={e => onChange({ audioEnabled: e.target.checked })} />
                                    <span className="switch-slider"></span>
                                </span>
                            </label>
                            <button className="btn-export-start" onClick={onClose}>Done</button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

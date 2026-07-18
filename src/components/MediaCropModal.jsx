import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    clamp, normalizeCrop, cropOutputHeight,
    clampView, DEFAULT_VIEW, newKeyframe, sampleKeyframes, mediaViewTransform,
    MEDIA_IMAGE_WIDTH, MEDIA_MAX_ZOOM
} from '../utils/mediaLayout';
import { CroppedImage } from './CroppedImage';

const STAGE_MAX_W = 320;
const STAGE_MAX_H = 340;
const MIN_CROP = 0.05; // smallest crop, as a fraction of the image

const normalizeKf = (k) => ({ id: k.id, t: clamp(k.t ?? 0, 0, 1), ...clampView(k) });

// Two-tab image editor:
//   Crop   — pick the sub-rectangle of the photo shown in the container.
//   Motion — add keyframes that pan/zoom INSIDE that container (Ken Burns),
//            never changing the container's on-screen size.
export const MediaCropModal = ({ item, onChange, onClose }) => {
    const [mode, setMode] = useState('crop');
    const [natural, setNatural] = useState(null);
    const stageRef = useRef(null);
    // crop drag state: { mode: 'move'|'nw'|'ne'|'sw'|'se', startX, startY, startCrop }
    const dragRef = useRef(null);
    const [dragging, setDragging] = useState(false);

    const crop = normalizeCrop(item.crop);

    // ---- Crop stage sizing (fit the full image inside the stage box) --------
    let stageW = STAGE_MAX_W, stageH = STAGE_MAX_H;
    if (natural) {
        const scale = Math.min(STAGE_MAX_W / natural.w, STAGE_MAX_H / natural.h);
        stageW = natural.w * scale;
        stageH = natural.h * scale;
    }

    const commit = useCallback((newCrop) => {
        const nc = normalizeCrop(newCrop);
        const patch = { crop: nc };
        if (natural) patch.height = cropOutputHeight(natural.w, natural.h, nc);
        onChange(patch);
    }, [natural, onChange]);

    useEffect(() => {
        if (!dragging) return;
        const handleMove = (e) => {
            const d = dragRef.current;
            if (!d) return;
            const dx = (e.clientX - d.startX) / stageW; // in normalized units
            const dy = (e.clientY - d.startY) / stageH;
            const s = d.startCrop;
            let { x, y, w, h } = s;

            if (d.mode === 'move') {
                x = clamp(s.x + dx, 0, 1 - s.w);
                y = clamp(s.y + dy, 0, 1 - s.h);
            } else {
                let left = s.x, top = s.y, right = s.x + s.w, bottom = s.y + s.h;
                if (d.mode.includes('w')) left = clamp(s.x + dx, 0, right - MIN_CROP);
                if (d.mode.includes('e')) right = clamp(s.x + s.w + dx, left + MIN_CROP, 1);
                if (d.mode.includes('n')) top = clamp(s.y + dy, 0, bottom - MIN_CROP);
                if (d.mode.includes('s')) bottom = clamp(s.y + s.h + dy, top + MIN_CROP, 1);
                x = left; y = top; w = right - left; h = bottom - top;
            }
            commit({ x, y, w, h });
        };
        const handleUp = () => setDragging(false);
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
        };
    }, [dragging, stageW, stageH, commit]);

    const startDrag = (dmode) => (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragRef.current = { mode: dmode, startX: e.clientX, startY: e.clientY, startCrop: crop };
        setDragging(true);
    };

    // Close on Escape while the popup is open.
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const box = {
        left: crop.x * stageW,
        top: crop.y * stageH,
        width: crop.w * stageW,
        height: crop.h * stageH
    };
    const handles = ['nw', 'ne', 'sw', 'se'];

    // ======================= MOTION (keyframes) ==============================
    const keyframes = item.keyframes || [];
    const sortedKfs = [...keyframes].sort((a, b) => a.t - b.t);
    const [selectedKfId, setSelectedKfId] = useState(null);
    const selectedKf = keyframes.find(k => k.id === selectedKfId) || null;

    // Auto-select the first keyframe when entering Motion with none selected.
    useEffect(() => {
        if (mode === 'motion' && !selectedKf && sortedKfs.length) {
            setSelectedKfId(sortedKfs[0].id);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, keyframes]);

    // Motion stage matches the container's aspect (972 x item.height).
    const containerAspect = MEDIA_IMAGE_WIDTH / (item.height || 760);
    let mW = STAGE_MAX_W, mH = STAGE_MAX_W / containerAspect;
    if (mH > STAGE_MAX_H) { mH = STAGE_MAX_H; mW = STAGE_MAX_H * containerAspect; }

    const updateKf = useCallback((id, patch) => {
        const next = (item.keyframes || []).map(k => k.id === id ? normalizeKf({ ...k, ...patch }) : k);
        onChange({ keyframes: next });
    }, [item.keyframes, onChange]);

    const setKfTime = useCallback((id, t) => {
        const next = (item.keyframes || []).map(k => k.id === id ? { ...k, t: clamp(t, 0, 1) } : k);
        onChange({ keyframes: next });
    }, [item.keyframes, onChange]);

    const addKf = () => {
        const kfs = item.keyframes || [];
        const sorted = [...kfs].sort((a, b) => a.t - b.t);
        const base = selectedKf || sorted[sorted.length - 1];
        const t = kfs.length === 0 ? 0 : Math.min(1, sorted[sorted.length - 1].t + 0.25);
        const view = base ? { scale: base.scale, cx: base.cx, cy: base.cy } : DEFAULT_VIEW;
        const kf = newKeyframe(t, view);
        onChange({ keyframes: [...kfs, kf] });
        setSelectedKfId(kf.id);
    };

    const deleteKf = (id) => {
        const next = (item.keyframes || []).filter(k => k.id !== id);
        onChange({ keyframes: next });
        if (selectedKfId === id) {
            const rest = [...next].sort((a, b) => a.t - b.t);
            setSelectedKfId(rest.length ? rest[0].id : null);
        }
    };

    // Unified drag for the motion stage: 'view' (pan the viewport) and 'kf'
    // (slide a keyframe's time along the strip). Bases are captured on mousedown
    // so updates stay correct even as the item prop changes mid-drag.
    const motionDragRef = useRef(null);
    const [motionDrag, setMotionDrag] = useState(false);
    useEffect(() => {
        if (!motionDrag) return;
        const move = (e) => {
            const d = motionDragRef.current;
            if (!d) return;
            if (d.kind === 'view') {
                const dx = (e.clientX - d.startX) / d.mW;
                const dy = (e.clientY - d.startY) / d.mH;
                updateKf(d.id, { cx: d.startCx + dx, cy: d.startCy + dy });
            } else if (d.kind === 'kf') {
                const dt = (e.clientX - d.startX) / d.stripW;
                setKfTime(d.id, d.startT + dt);
            }
        };
        const up = () => setMotionDrag(false);
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
        return () => {
            window.removeEventListener('mousemove', move);
            window.removeEventListener('mouseup', up);
        };
    }, [motionDrag, updateKf, setKfTime]);

    const startViewDrag = (e) => {
        if (!selectedKf) return;
        e.preventDefault();
        e.stopPropagation();
        motionDragRef.current = { kind: 'view', id: selectedKf.id, startX: e.clientX, startY: e.clientY, startCx: selectedKf.cx, startCy: selectedKf.cy, mW, mH };
        setMotionDrag(true);
    };
    const startKfDrag = (kf, stripW) => (e) => {
        e.preventDefault();
        e.stopPropagation();
        setSelectedKfId(kf.id);
        motionDragRef.current = { kind: 'kf', id: kf.id, startX: e.clientX, startT: kf.t, stripW };
        setMotionDrag(true);
    };

    // Live motion preview: ramp progress 0→1 over the item's duration, looping,
    // applying the interpolated view to the image via an imperative transform.
    const previewWrapRef = useRef(null);
    const [previewing, setPreviewing] = useState(false);
    useEffect(() => {
        if (!previewing) {
            if (previewWrapRef.current) previewWrapRef.current.style.transform = 'none';
            return;
        }
        const kfs = item.keyframes || [];
        if (kfs.length === 0) { setPreviewing(false); return; }
        let raf;
        const start = performance.now();
        const dur = Math.max(0.4, item.duration || 1) * 1000;
        const loop = () => {
            const p = ((performance.now() - start) % dur) / dur;
            if (previewWrapRef.current) {
                previewWrapRef.current.style.transform = mediaViewTransform(sampleKeyframes(kfs, p), mW, mH);
            }
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, [previewing, item.keyframes, item.duration, mW, mH]);

    const viewBox = selectedKf ? {
        left: (selectedKf.cx - 0.5 / selectedKf.scale) * mW,
        top: (selectedKf.cy - 0.5 / selectedKf.scale) * mH,
        width: mW / selectedKf.scale,
        height: mH / selectedKf.scale
    } : null;

    const dur = item.duration || 0;

    return (
        <div className="export-modal-overlay" onClick={onClose}>
            <div className="export-modal crop-modal" onClick={e => e.stopPropagation()}>
                <div className="crop-tabs">
                    <button className={`crop-tab ${mode === 'crop' ? 'active' : ''}`} onClick={() => setMode('crop')}>Crop</button>
                    <button className={`crop-tab ${mode === 'motion' ? 'active' : ''}`} onClick={() => setMode('motion')}>Motion</button>
                </div>

                {mode === 'crop' ? (
                    <>
                        <p className="export-modal-sub">Drag the box to move it, or its corners to resize. The video image keeps this crop's shape.</p>

                        <div className="crop-stage-wrap">
                            <div ref={stageRef} className="crop-stage" style={{ width: stageW, height: stageH }}>
                                <img
                                    src={item.src}
                                    alt=""
                                    draggable={false}
                                    onLoad={e => setNatural({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
                                    style={{ width: '100%', height: '100%', display: 'block', userSelect: 'none' }}
                                />
                                <div
                                    className="crop-box"
                                    style={{ left: box.left, top: box.top, width: box.width, height: box.height, cursor: dragging ? 'grabbing' : 'grab' }}
                                    onMouseDown={startDrag('move')}
                                >
                                    {handles.map(h => (
                                        <div key={h} className={`crop-handle crop-handle-${h}`} onMouseDown={startDrag(h)} />
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
                            <button className="btn-ghost" onClick={() => commit({ x: 0, y: 0, w: 1, h: 1 })}>Reset crop</button>
                            <button className="btn-export-start" onClick={onClose}>Done</button>
                        </div>
                    </>
                ) : (
                    <>
                        <p className="export-modal-sub">Add 2+ keyframes to pan &amp; zoom inside the image. Drag the box to set the position, use the zoom slider (or scroll) to zoom.</p>

                        <div className="crop-stage-wrap">
                            <div
                                className="crop-stage"
                                style={{ width: mW, height: mH }}
                                onWheel={(e) => {
                                    if (!selectedKf || previewing) return;
                                    e.preventDefault();
                                    const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
                                    updateKf(selectedKf.id, { scale: selectedKf.scale * factor });
                                }}
                            >
                                <div ref={previewWrapRef} style={{ width: '100%', height: '100%', transformOrigin: '0 0' }}>
                                    <CroppedImage src={item.src} boxW={mW} boxH={mH} crop={item.crop} />
                                </div>

                                {!previewing && viewBox && (
                                    <div
                                        className="crop-box view-box"
                                        style={{ left: viewBox.left, top: viewBox.top, width: viewBox.width, height: viewBox.height, cursor: motionDrag ? 'grabbing' : 'grab' }}
                                        onMouseDown={startViewDrag}
                                    />
                                )}
                                {!previewing && !selectedKf && (
                                    <div className="motion-empty">No keyframes yet</div>
                                )}
                            </div>
                        </div>

                        {/* Keyframe strip (mini-timeline: 0 → duration) */}
                        <KfStrip
                            sortedKfs={sortedKfs}
                            selectedKfId={selectedKfId}
                            onSelect={setSelectedKfId}
                            startKfDrag={startKfDrag}
                        />

                        <div className="motion-controls">
                            {selectedKf ? (
                                <>
                                    <div className="field-row cols-2">
                                        <div className="field">
                                            <label>Time (s)</label>
                                            <input
                                                type="number" step="0.1" min="0" max={dur} className="panel-input"
                                                value={(selectedKf.t * dur).toFixed(2)}
                                                onChange={e => setKfTime(selectedKf.id, dur > 0 ? (parseFloat(e.target.value) || 0) / dur : 0)}
                                            />
                                        </div>
                                        <div className="field">
                                            <label>Zoom ({selectedKf.scale.toFixed(2)}x)</label>
                                            <input
                                                type="range" min="1" max={MEDIA_MAX_ZOOM} step="0.01"
                                                value={selectedKf.scale}
                                                onChange={e => updateKf(selectedKf.id, { scale: parseFloat(e.target.value) })}
                                                style={{ width: '100%' }}
                                            />
                                        </div>
                                    </div>
                                    <button className="btn-ghost danger-ghost" style={{ height: 32, width: '100%' }} onClick={() => deleteKf(selectedKf.id)}>
                                        Delete keyframe
                                    </button>
                                </>
                            ) : (
                                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0' }}>
                                    Click “Add keyframe”, then position and zoom it. Add another at a later time to create motion.
                                </p>
                            )}
                        </div>

                        <div className="export-modal-footer" style={{ justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn-ghost" onClick={addKf}>+ Add keyframe</button>
                                <button
                                    className={`btn-ghost ${previewing ? 'active-ghost' : ''}`}
                                    disabled={sortedKfs.length === 0}
                                    onClick={() => setPreviewing(p => !p)}
                                >
                                    {previewing ? '■ Stop' : '▶ Preview'}
                                </button>
                            </div>
                            <button className="btn-export-start" onClick={onClose}>Done</button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

// The keyframe mini-timeline. Measures its own width so time-dragging maps mouse
// pixels → normalized time.
const KfStrip = ({ sortedKfs, selectedKfId, onSelect, startKfDrag }) => {
    const stripRef = useRef(null);
    return (
        <div className="kf-strip" ref={stripRef}>
            <div className="kf-strip-line" />
            {sortedKfs.map(kf => (
                <div
                    key={kf.id}
                    className={`kf-marker ${selectedKfId === kf.id ? 'selected' : ''}`}
                    style={{ left: `${kf.t * 100}%` }}
                    title={`${kf.scale.toFixed(2)}x`}
                    onMouseDown={(e) => startKfDrag(kf, stripRef.current?.clientWidth || 1)(e)}
                    onClick={() => onSelect(kf.id)}
                />
            ))}
        </div>
    );
};

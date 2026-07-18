import React, { useState, useRef, useEffect, useCallback } from 'react';
import { clamp, normalizeCrop, cropOutputHeight } from '../utils/mediaLayout';

const STAGE_MAX_W = 320;
const STAGE_MAX_H = 340;
const MIN_CROP = 0.05; // smallest crop, as a fraction of the image

// Interactive image cropper: the full image shown on top with a draggable /
// resizable crop rectangle over it. `onChange` receives the normalized crop and
// the derived output height (kept in aspect so the video image isn't stretched).
// Pan/zoom motion is edited on the timeline + preview, not here.
export const MediaCropModal = ({ item, onChange, onClose }) => {
    const [natural, setNatural] = useState(null);
    const stageRef = useRef(null);
    // drag state: { mode: 'move'|'nw'|'ne'|'sw'|'se', startX, startY, startCrop }
    const dragRef = useRef(null);
    const [dragging, setDragging] = useState(false);

    const crop = normalizeCrop(item.crop);

    // Fit the image inside the stage box, preserving aspect.
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
                // Resize from a corner, keeping the opposite corner fixed.
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

    const startDrag = (mode) => (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragRef.current = { mode, startX: e.clientX, startY: e.clientY, startCrop: crop };
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

    return (
        <div className="export-modal-overlay" onClick={onClose}>
            <div className="export-modal crop-modal" onClick={e => e.stopPropagation()}>
                <h3>Crop Image</h3>
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
                        {/* dim overlay outside the crop box (4px border trick via box-shadow) */}
                        <div
                            className="crop-box"
                            style={{ left: box.left, top: box.top, width: box.width, height: box.height, cursor: dragging ? 'grabbing' : 'grab' }}
                            onMouseDown={startDrag('move')}
                        >
                            {handles.map(h => (
                                <div
                                    key={h}
                                    className={`crop-handle crop-handle-${h}`}
                                    onMouseDown={startDrag(h)}
                                />
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
            </div>
        </div>
    );
};

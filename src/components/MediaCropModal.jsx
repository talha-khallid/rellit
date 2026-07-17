import React, { useState, useRef, useEffect } from 'react';
import { CroppedImage } from './CroppedImage';
import { computeCropGeometry, clamp } from '../utils/mediaLayout';

const TEXT_COLUMN_WIDTH = 1080 - 54 - 157; // 869 — always the image's true width
const STAGE_MAX_W = 280;
const STAGE_MAX_H = 360;

const ASPECT_PRESETS = [
    { label: 'Square', ratio: 1 },
    { label: 'Portrait', ratio: 4 / 5 },
    { label: 'Wide', ratio: 16 / 9 }
];

export const MediaCropModal = ({ item, onChange, onClose }) => {
    const [natural, setNatural] = useState(null);
    const dragRef = useRef(null); // { startX, startY, startFocalX, startFocalY }
    const [isDragging, setIsDragging] = useState(false);

    const displayScale = Math.min(STAGE_MAX_W / TEXT_COLUMN_WIDTH, STAGE_MAX_H / Math.max(1, item.height));
    const stageW = TEXT_COLUMN_WIDTH * displayScale;
    const stageH = item.height * displayScale;

    useEffect(() => {
        if (!isDragging) return;
        const handleMove = (e) => {
            if (!dragRef.current || !natural) return;
            const geo = computeCropGeometry(natural.w, natural.h, stageW, stageH, 'cover', item.focalX, item.focalY, item.zoom);
            if (!geo || geo.mode !== 'cover') return;
            const dx = e.clientX - dragRef.current.startX;
            const dy = e.clientY - dragRef.current.startY;
            const newFocalX = clamp(dragRef.current.startFocalX - (dx / geo.effScale) / natural.w, 0, 1);
            const newFocalY = clamp(dragRef.current.startFocalY - (dy / geo.effScale) / natural.h, 0, 1);
            onChange({ focalX: newFocalX, focalY: newFocalY });
        };
        const handleUp = () => setIsDragging(false);
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
        };
        // eslint-disable-next-line
    }, [isDragging, natural, stageW, stageH, item.focalX, item.focalY, item.zoom]);

    const startDrag = (e) => {
        if (item.fit !== 'cover') return;
        dragRef.current = { startX: e.clientX, startY: e.clientY, startFocalX: item.focalX ?? 0.5, startFocalY: item.focalY ?? 0.5 };
        setIsDragging(true);
    };

    const applyPreset = (ratio) => {
        onChange({ height: Math.round(TEXT_COLUMN_WIDTH / ratio) });
    };

    return (
        <div className="export-modal-overlay" onClick={onClose}>
            <div className="export-modal crop-modal" onClick={e => e.stopPropagation()}>
                <h3>Edit Image</h3>
                <p className="export-modal-sub">Sized to the caption text width — choose how it fills its area.</p>

                <div className="export-modal-body">
                    <label>Fit</label>
                    <div className="export-fps-row">
                        <button className={`export-fps-chip ${item.fit === 'contain' ? 'active' : ''}`} onClick={() => onChange({ fit: 'contain' })}>Fit (whole image)</button>
                        <button className={`export-fps-chip ${item.fit === 'cover' ? 'active' : ''}`} onClick={() => onChange({ fit: 'cover' })}>Fill (crop)</button>
                    </div>
                </div>

                <div
                    className={`crop-stage ${item.fit === 'cover' ? 'draggable' : ''} ${isDragging ? 'dragging' : ''}`}
                    style={{ width: stageW, height: stageH }}
                    onMouseDown={startDrag}
                >
                    <CroppedImage
                        src={item.src}
                        boxW={stageW}
                        boxH={stageH}
                        fit={item.fit}
                        focalX={item.focalX}
                        focalY={item.focalY}
                        zoom={item.zoom}
                        onNaturalSize={setNatural}
                    />
                </div>

                {item.fit === 'cover' && (
                    <div className="export-modal-body">
                        <label>Zoom</label>
                        <input
                            type="range" min="1" max="3" step="0.05"
                            value={item.zoom ?? 1}
                            onChange={e => onChange({ zoom: parseFloat(e.target.value) })}
                            style={{ width: '100%' }}
                        />
                    </div>
                )}

                <div className="export-modal-body">
                    <label>Height</label>
                    <div className="field-row cols-2" style={{ marginBottom: 8 }}>
                        <input
                            type="number"
                            className="panel-input"
                            value={item.height}
                            onChange={e => onChange({ height: Math.max(60, parseInt(e.target.value) || 60) })}
                        />
                        <button className="btn-ghost" onClick={() => onChange({ focalX: 0.5, focalY: 0.5, zoom: 1 })}>Reset crop</button>
                    </div>
                    <div className="export-fps-row">
                        {ASPECT_PRESETS.map(p => (
                            <button key={p.label} className="export-fps-chip" onClick={() => applyPreset(p.ratio)}>{p.label}</button>
                        ))}
                    </div>
                </div>

                <div className="export-modal-footer">
                    <button className="btn-export-start" onClick={onClose}>Done</button>
                </div>
            </div>
        </div>
    );
};

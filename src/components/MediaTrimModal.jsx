import React, { useRef, useState, useEffect } from 'react';
import { clamp } from '../utils/mediaLayout';

// Trim a source video down to at most the caption timeline's length. Shows the
// full video (playable) with its own timeline and a draggable trim window whose
// length is capped to `editingDuration` (and to the video's own length).
export const MediaTrimModal = ({ item, editingDuration, onChange, onClose }) => {
    const videoRef = useRef(null);
    const trackRef = useRef(null);
    const [dur, setDur] = useState(item.videoDuration || 0);  // source length (s)
    const [cur, setCur] = useState(0);                         // playback position (s)
    const [playing, setPlaying] = useState(false);

    const vidDur = dur || item.videoDuration || 0;
    const maxLen = Math.min(editingDuration || vidDur, vidDur);
    const minLen = Math.min(0.5, maxLen);

    const trimStart = clamp(item.trimStart || 0, 0, Math.max(0, vidDur - minLen));
    const length = clamp(item.duration || maxLen, minLen, Math.max(minLen, Math.min(maxLen, vidDur - trimStart)));
    const trimEnd = trimStart + length;

    const dragRef = useRef(null);
    const [dragging, setDragging] = useState(false);

    const pct = (t) => (vidDur > 0 ? (t / vidDur) * 100 : 0);

    const commit = (nextStart, nextLen) => {
        const s = clamp(nextStart, 0, Math.max(0, vidDur - minLen));
        const len = clamp(nextLen, minLen, Math.max(minLen, Math.min(maxLen, vidDur - s)));
        onChange({ trimStart: s, duration: len });
    };

    // Reflect the audio toggle on the modal's own <video>.
    useEffect(() => {
        const v = videoRef.current;
        if (v) v.muted = !item.audioEnabled;
    }, [item.audioEnabled]);

    // Loop playback within the trim window so the user previews the trimmed clip.
    const onTimeUpdate = () => {
        const v = videoRef.current;
        if (!v) return;
        setCur(v.currentTime);
        if (v.currentTime >= trimEnd - 0.02 || v.currentTime < trimStart - 0.05) {
            v.currentTime = trimStart;
        }
    };

    const togglePlay = () => {
        const v = videoRef.current;
        if (!v) return;
        if (v.paused) {
            if (v.currentTime < trimStart || v.currentTime >= trimEnd) v.currentTime = trimStart;
            const p = v.play(); if (p && p.catch) p.catch(() => {});
            setPlaying(true);
        } else { v.pause(); setPlaying(false); }
    };

    const startDrag = (mode) => (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragRef.current = { mode, startX: e.clientX, startTrim: trimStart, startLen: length, w: trackRef.current?.clientWidth || 1 };
        setDragging(true);
    };

    useEffect(() => {
        if (!dragging) return;
        const move = (e) => {
            const d = dragRef.current;
            if (!d) return;
            const dt = ((e.clientX - d.startX) / d.w) * vidDur;
            if (d.mode === 'move') {
                commit(d.startTrim + dt, d.startLen);
            } else if (d.mode === 'left') {
                const end = d.startTrim + d.startLen;
                const ns = clamp(d.startTrim + dt, 0, end - minLen);
                commit(ns, end - ns);
            } else if (d.mode === 'right') {
                commit(d.startTrim, d.startLen + dt);
            }
        };
        const up = () => setDragging(false);
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
        return () => {
            window.removeEventListener('mousemove', move);
            window.removeEventListener('mouseup', up);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dragging, vidDur, maxLen, minLen]);

    const seekTrack = (e) => {
        if (e.target.closest('.trim-window')) return;
        const rect = trackRef.current.getBoundingClientRect();
        const t = clamp(((e.clientX - rect.left) / rect.width) * vidDur, 0, vidDur);
        const v = videoRef.current;
        if (v) { v.currentTime = t; setCur(t); }
    };

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div className="export-modal-overlay" onClick={onClose}>
            <div className="export-modal trim-modal" onClick={e => e.stopPropagation()}>
                <h3>Trim Video</h3>
                <p className="export-modal-sub">
                    Trim your clip to fit the caption timeline. The selection can be at most {maxLen.toFixed(1)}s (the video's length).
                </p>

                <div className="trim-video-wrap">
                    <video
                        ref={videoRef}
                        src={item.src}
                        playsInline
                        onLoadedMetadata={e => { setDur(e.target.duration || item.videoDuration || 0); e.target.currentTime = trimStart; }}
                        onTimeUpdate={onTimeUpdate}
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
                    <span className="trim-time">{cur.toFixed(1)}s</span>
                    <span className="trim-sel">Selected {length.toFixed(1)}s · max {maxLen.toFixed(1)}s</span>
                </div>

                <div className="trim-track" ref={trackRef} onMouseDown={seekTrack}>
                    <div
                        className="trim-window"
                        style={{ left: `${pct(trimStart)}%`, width: `${pct(length)}%`, cursor: dragging ? 'grabbing' : 'grab' }}
                        onMouseDown={startDrag('move')}
                    >
                        <div className="trim-handle left" onMouseDown={startDrag('left')} />
                        <div className="trim-handle right" onMouseDown={startDrag('right')} />
                    </div>
                    <div className="trim-playhead" style={{ left: `${pct(cur)}%` }} />
                </div>

                <div className="trim-fields">
                    <div className="field">
                        <label>Start (s)</label>
                        <input
                            type="number" step="0.1" min="0" max={vidDur} className="panel-input"
                            value={trimStart.toFixed(2)}
                            onChange={e => commit(parseFloat(e.target.value) || 0, length)}
                        />
                    </div>
                    <div className="field">
                        <label>Length (s)</label>
                        <input
                            type="number" step="0.1" min="0" max={maxLen} className="panel-input"
                            value={length.toFixed(2)}
                            onChange={e => commit(trimStart, parseFloat(e.target.value) || minLen)}
                        />
                    </div>
                </div>

                <div className="export-modal-footer" style={{ justifyContent: 'space-between' }}>
                    <label className="trim-audio-toggle">
                        <input type="checkbox" checked={!!item.audioEnabled} onChange={e => onChange({ audioEnabled: e.target.checked })} />
                        Play video audio
                    </label>
                    <button className="btn-export-start" onClick={onClose}>Done</button>
                </div>
            </div>
        </div>
    );
};

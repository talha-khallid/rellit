import React, { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { EditorContext } from '../context/EditorContext';
import { editToKeeps, editedDuration, getEditedBuffer } from '../utils/audioData';

// Double-clicking an audio clip opens this: a big, zoomable, playable waveform
// where you trim the start/end and cut out middle sections. The edit is stored
// non-destructively on the segment (`audioEdit`); the clip stays ONE block on the
// main timeline while playback/export use the spliced result.
export const AudioTrimModal = ({ segIdx, onClose }) => {
    const { segments, setSegments, getAudioCtx, visualLines, lineSettings, setLineSettings } = useContext(EditorContext);
    const seg = segments[segIdx];
    const buffer = seg && seg.audioBuffer && typeof seg.audioBuffer.getChannelData === 'function' ? seg.audioBuffer : null;
    const dur = buffer ? buffer.duration : 0;

    const edit = seg?.audioEdit || {};
    const start = Math.min(Math.max(edit.start ?? 0, 0), dur);
    const end = Math.min(Math.max(edit.end ?? dur, start), dur);
    const cuts = edit.cuts || [];

    const wrapRef = useRef(null);
    const canvasRef = useRef(null);
    const playheadRef = useRef(null);
    const [pxW, setPxW] = useState(760);
    const [view, setView] = useState({ s: 0, e: dur || 1 });
    const [sel, setSel] = useState(null);          // { a, b } source seconds
    const [playing, setPlaying] = useState(false);
    const [head, setHead] = useState(0);           // playhead (source seconds) while paused
    const dragRef = useRef(null);
    const playRef = useRef(null);                  // { src, ctxStart, audioStart }
    const H = 150;

    // Shrink/grow ONLY this segment's caption lines so they sum to the edited audio
    // length. This makes trimming actually SHORTEN the clip (removing the removed
    // audio, pulling later content earlier) instead of leaving a same-length block
    // with silent gaps. Proportional, so the lines keep their relative pacing.
    const redistribute = (ed) => {
        const idxs = [];
        visualLines.forEach((line, i) => { if (line[0]?.segIndex === segIdx) idxs.push(i); });
        if (!idxs.length) return;
        setLineSettings(prev => {
            const cur = idxs.map(i => parseFloat(prev[i]?.duration || 0));
            const total = cur.reduce((a, b) => a + b, 0);
            const next = { ...prev };
            if (total <= 0) {
                idxs.forEach(i => { next[i] = { ...(next[i] || { color: '#ffffff' }), duration: (ed / idxs.length).toFixed(2) }; });
            } else {
                let acc = 0;
                idxs.forEach((i, k) => {
                    let d = Math.round((cur[k] / total) * ed * 100) / 100;
                    if (d < 0.1) d = 0.1;
                    next[i] = { ...(next[i] || { color: '#ffffff' }), duration: d.toFixed(2) };
                    acc += parseFloat(next[i].duration);
                });
                const diff = ed - acc;
                if (Math.abs(diff) > 0.001) {
                    const last = idxs[idxs.length - 1];
                    let c = parseFloat(next[last].duration) + diff;
                    if (c < 0.1) c = 0.1;
                    next[last] = { ...next[last], duration: c.toFixed(2) };
                }
            }
            return next;
        });
    };

    const commit = (next) => {
        // Store only the edit (audioDuration stays the TRUE original so the edit
        // math is stable). Shrinking the caption lines to the edited length happens
        // here for instant feedback, and via enforceSegmentAudioConstraints on load.
        setSegments(prev => prev.map((s, i) => i === segIdx ? { ...s, audioEdit: next } : s));
        redistribute(editedDuration(next, dur));
    };
    const setStart = (v) => commit({ start: Math.min(Math.max(0, v), end - 0.02), end, cuts });
    const setEnd = (v) => commit({ start, end: Math.max(Math.min(dur, v), start + 0.02), cuts });
    const addCut = (a, b) => { const lo = Math.max(start, Math.min(a, b)), hi = Math.min(end, Math.max(a, b)); if (hi - lo > 0.01) commit({ start, end, cuts: [...cuts, [lo, hi]] }); };
    const removeCut = (idx) => commit({ start, end, cuts: cuts.filter((_, i) => i !== idx) });
    const resetEdit = () => commit({ start: 0, end: dur, cuts: [] });

    // ---- coordinate helpers ----
    const span = () => Math.max(0.02, view.e - view.s);
    const timeToX = (t) => ((t - view.s) / span()) * pxW;
    const xToTime = (x) => view.s + (x / pxW) * span();

    // ---- measure width ----
    useLayoutEffect(() => {
        const measure = () => { if (wrapRef.current) setPxW(wrapRef.current.clientWidth); };
        measure();
        const ro = new ResizeObserver(measure);
        if (wrapRef.current) ro.observe(wrapRef.current);
        return () => ro.disconnect();
    }, []);

    // ---- draw the waveform + trim/cut shading for the current view window ----
    useLayoutEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !buffer || pxW <= 0) return;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = pxW * dpr; canvas.height = H * dpr;
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, pxW, H);

        const data = buffer.getChannelData(0);
        const sr = buffer.sampleRate;
        const step = 3;                       // px per bar
        const amp = H / 2;
        const isKept = (t) => t >= start && t <= end && !cuts.some(([cs, ce]) => t >= cs && t <= ce);

        for (let x = 0; x < pxW; x += step) {
            const t0 = xToTime(x), t1 = xToTime(x + step);
            const a = Math.max(0, Math.floor(t0 * sr)), b = Math.min(data.length, Math.floor(t1 * sr));
            let max = 0;
            for (let j = a; j < b; j += 2) { const v = Math.abs(data[j]); if (v > max) max = v; }
            const h = Math.max(1.5, max * amp * 1.7);
            ctx.strokeStyle = isKept((t0 + t1) / 2) ? 'rgba(120,170,255,0.9)' : 'rgba(255,255,255,0.14)';
            ctx.lineWidth = 2; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(x + 1, amp - h / 2); ctx.lineTo(x + 1, amp + h / 2); ctx.stroke();
        }

        // Shade removed regions (before start / after end / cuts).
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        if (start > view.s) ctx.fillRect(0, 0, timeToX(start), H);
        if (end < view.e) ctx.fillRect(timeToX(end), 0, pxW - timeToX(end), H);
        ctx.fillStyle = 'rgba(255,70,70,0.22)';
        for (const [cs, ce] of cuts) ctx.fillRect(timeToX(cs), 0, timeToX(ce) - timeToX(cs), H);

        // Selection band.
        if (sel) {
            const a = timeToX(Math.min(sel.a, sel.b)), b = timeToX(Math.max(sel.a, sel.b));
            ctx.fillStyle = 'rgba(90,200,140,0.25)'; ctx.fillRect(a, 0, b - a, H);
            ctx.strokeStyle = 'rgba(90,200,140,0.9)'; ctx.lineWidth = 1;
            ctx.strokeRect(a + 0.5, 0.5, b - a - 1, H - 1);
        }
    }, [buffer, pxW, view, start, end, cuts, sel]);

    // ---- playback (plays the EDITED result; the playhead maps back onto the
    //      source waveform so it visibly SKIPS the trimmed/cut regions) ----
    const keeps = editToKeeps({ start, end, cuts }, dur);
    const editedTotal = keeps.reduce((a, [s, e]) => a + (e - s), 0);
    const srcToEdited = (T) => { let acc = 0; for (const [ks, ke] of keeps) { if (T < ks) return acc; if (T <= ke) return acc + (T - ks); acc += ke - ks; } return acc; };
    const editedToSrc = (E) => { let acc = 0; for (const [ks, ke] of keeps) { const len = ke - ks; if (E <= acc + len) return ks + (E - acc); acc += len; } return keeps.length ? keeps[keeps.length - 1][1] : 0; };

    const stopPlay = (finalSrc) => {
        if (playRef.current) { try { playRef.current.src.stop(); } catch (e) { } playRef.current = null; }
        if (typeof finalSrc === 'number') setHead(Math.min(Math.max(0, finalSrc), dur));
        setPlaying(false);
    };
    const startPlay = (fromSrc) => {
        if (!buffer || editedTotal <= 0.01) return;
        const ctx = getAudioCtx();
        if (ctx.state === 'suspended') ctx.resume();
        if (playRef.current) { try { playRef.current.src.stop(); } catch (e) { } }
        const edited = getEditedBuffer(ctx, buffer, { start, end, cuts });
        const src = ctx.createBufferSource();
        src.buffer = edited; src.connect(ctx.destination);
        let eAt = srcToEdited(Math.min(Math.max(0, fromSrc), dur));
        if (eAt >= editedTotal - 0.02) eAt = 0;                 // at the end → play from the top
        src.start(0, Math.min(eAt, edited.duration - 0.005));
        src.onended = () => { if (playRef.current && playRef.current.src === src) stopPlay(end); };
        playRef.current = { src, ctxStart: ctx.currentTime, editedStart: eAt };
        setPlaying(true);
    };
    const curEdited = () => { if (!playRef.current) return srcToEdited(head); const ctx = getAudioCtx(); return playRef.current.editedStart + (ctx.currentTime - playRef.current.ctxStart); };
    const curPlayTime = () => editedToSrc(curEdited());        // source seconds (for display / head)
    const togglePlay = () => { if (playing) stopPlay(curPlayTime()); else startPlay(head); };

    // Animate the playhead while playing (DOM-only, no re-render).
    useEffect(() => {
        if (!playing) return;
        let raf;
        const loop = () => {
            if (curEdited() >= editedTotal) { stopPlay(end); return; }
            const t = curPlayTime();
            if (playheadRef.current) {
                const x = timeToX(t);
                const vis = t >= view.s && t <= view.e;
                playheadRef.current.style.opacity = vis ? '1' : '0';
                playheadRef.current.style.left = x + 'px';
            }
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playing, view, pxW]);

    // Paused playhead position.
    useEffect(() => {
        if (playing || !playheadRef.current) return;
        const x = timeToX(head);
        playheadRef.current.style.opacity = (head >= view.s && head <= view.e) ? '1' : '0';
        playheadRef.current.style.left = x + 'px';
    }, [head, view, pxW, playing]);

    // Stop audio when the modal closes.
    useEffect(() => () => { if (playRef.current) { try { playRef.current.src.stop(); } catch (e) { } } }, []);

    // Space plays/pauses THIS clip (capture phase so the main preview stays put).
    useEffect(() => {
        const onKey = (e) => {
            if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); e.stopImmediatePropagation(); togglePlay(); }
            else if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playing, head, buffer]);

    // ---- wheel to zoom (centred on the cursor) ----
    const onWheel = (e) => {
        e.preventDefault();
        const rect = canvasRef.current.getBoundingClientRect();
        const cursorT = xToTime(e.clientX - rect.left);
        const factor = e.deltaY < 0 ? 0.8 : 1.25;
        let newSpan = Math.min(dur, Math.max(0.08, span() * factor));
        let s = cursorT - (cursorT - view.s) * (newSpan / span());
        s = Math.min(Math.max(0, s), Math.max(0, dur - newSpan));
        setView({ s, e: s + newSpan });
    };

    // ---- pointer interaction on the waveform ----
    const onCanvasDown = (e) => {
        if (e.button !== 0) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const t0 = xToTime(e.clientX - rect.left);
        dragRef.current = { mode: 'sel', startX: e.clientX, t0, moved: false };
    };
    const onHandleDown = (which) => (e) => {
        e.stopPropagation();
        dragRef.current = { mode: which };
    };
    useEffect(() => {
        const move = (e) => {
            const d = dragRef.current; if (!d) return;
            const rect = canvasRef.current.getBoundingClientRect();
            const t = xToTime(e.clientX - rect.left);
            if (d.mode === 'handle-left') setStart(t);
            else if (d.mode === 'handle-right') setEnd(t);
            else if (d.mode === 'sel') {
                if (!d.moved && Math.abs(e.clientX - d.startX) < 3) return;
                d.moved = true;
                setSel({ a: d.t0, b: t });
            }
        };
        const up = (e) => {
            const d = dragRef.current; if (!d) { return; }
            if (d.mode === 'sel' && !d.moved) { setHead(Math.min(Math.max(0, d.t0), dur)); if (playing) startPlay(d.t0); setSel(null); }
            dragRef.current = null;
        };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
        return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [view, pxW, start, end, cuts, playing, head]);

    const fmt = (t) => `${t.toFixed(2)}s`;
    const keptDur = editedDuration({ start, end, cuts }, dur);
    const selValid = sel && Math.abs(sel.a - sel.b) > 0.01;

    if (!buffer) {
        return (
            <div className="export-modal-overlay" onClick={onClose}>
                <div className="audio-trim-modal" onClick={e => e.stopPropagation()}>
                    <div className="atm-head"><span>Edit audio</span><button className="atm-x" onClick={onClose}>✕</button></div>
                    <div className="atm-empty">This clip has no decoded audio yet.</div>
                </div>
            </div>
        );
    }

    return (
        <div className="export-modal-overlay" onClick={onClose}>
            <div className="audio-trim-modal" onClick={e => e.stopPropagation()}>
                <div className="atm-head">
                    <span>Edit audio · segment {segIdx + 1}</span>
                    <button className="atm-x" onClick={onClose}>✕</button>
                </div>

                <div className="atm-wave-wrap" ref={wrapRef} onWheel={onWheel}>
                    <canvas
                        ref={canvasRef}
                        className="atm-canvas"
                        style={{ width: pxW, height: H }}
                        onMouseDown={onCanvasDown}
                    />
                    {/* trim handles */}
                    {start >= view.s && start <= view.e && (
                        <div className="atm-handle" style={{ left: timeToX(start) }} onMouseDown={onHandleDown('handle-left')} title="Trim start" />
                    )}
                    {end >= view.s && end <= view.e && (
                        <div className="atm-handle" style={{ left: timeToX(end) }} onMouseDown={onHandleDown('handle-right')} title="Trim end" />
                    )}
                    {/* cut delete buttons */}
                    {cuts.map(([cs, ce], i) => {
                        const cx = (timeToX(cs) + timeToX(ce)) / 2;
                        if (cx < 0 || cx > pxW) return null;
                        return <button key={i} className="atm-cut-del" style={{ left: cx }} title="Restore this cut" onClick={() => removeCut(i)}>✕</button>;
                    })}
                    <div ref={playheadRef} className="atm-playhead" style={{ left: 0 }} />
                </div>

                <div className="atm-toolbar">
                    <button className="atm-btn primary" onClick={togglePlay}>{playing ? '❚❚ Pause' : '▶ Play'}</button>
                    <button className="atm-btn" disabled={!selValid} onClick={() => { if (selValid) { addCut(sel.a, sel.b); setSel(null); } }}>Remove selection</button>
                    {sel && <button className="atm-btn ghost" onClick={() => setSel(null)}>Clear</button>}
                    <div className="atm-spacer" />
                    <button className="atm-btn ghost" title="Zoom out" onClick={() => setView({ s: 0, e: dur })}>Fit</button>
                    <span className="atm-readout">kept {fmt(keptDur)} / {fmt(dur)}</span>
                </div>

                <div className="atm-fields">
                    <label>Start <input type="number" step="0.05" min="0" max={end} value={+start.toFixed(2)} onChange={e => setStart(parseFloat(e.target.value) || 0)} /></label>
                    <label>End <input type="number" step="0.05" min={start} max={dur} value={+end.toFixed(2)} onChange={e => setEnd(parseFloat(e.target.value) || 0)} /></label>
                    <div className="atm-spacer" />
                    <button className="atm-btn ghost" onClick={resetEdit}>Reset</button>
                    <button className="atm-btn primary" onClick={onClose}>Done</button>
                </div>
                <div className="atm-hint">Drag on the wave to select a middle part, then “Remove selection”. Drag the edge handles to trim. Scroll to zoom · Space to play.</div>
            </div>
        </div>
    );
};

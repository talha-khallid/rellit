import React, { useContext, useRef, useState, useEffect } from 'react';
import { EditorContext } from '../context/EditorContext';
import { AudioWaveform } from '../components/AudioWaveform';
import { AudioTrimModal } from '../components/AudioTrimModal';
import { getEditedBuffer } from '../utils/audioData';
import { clampMediaWindow, keyframeAt, newKeyframe, sampleKeyframes, clamp, MEDIA_MIN_GAP_SEC, MEDIA_TRANSITION_TYPES, getItemTransition } from '../utils/mediaLayout';

export const Timeline = () => {
    const {
        segments, visualLines, lineSettings, updateLineSettings,
        isPlaying, togglePlayback,
        currentLineIndex, setCurrentLineIndex,
        timelineScale, setTimelineScale,
        setCurrentSelectionCharIds,
        currentTimeRef,
        mediaItems, setMediaItems,
        selectedMediaId, setSelectedMediaId,
        activeMediaId,
        setActiveTab,
        cropModalMediaId, setCropModalMediaId,
        selectedKeyframeId, setSelectedKeyframeId,
        getAudioCtx
    } = useContext(EditorContext);

    const [isResizing, setIsResizing] = useState(false);
    const [resizeLineIdx, setResizeLineIdx] = useState(-1);
    const [startX, setStartX] = useState(0);
    const [initialDur, setInitialDur] = useState(0);

    // Big-image block: drag-to-move
    const [isMovingMedia, setIsMovingMedia] = useState(false);
    const [moveMediaId, setMoveMediaId] = useState(null);
    const [moveStartX, setMoveStartX] = useState(0);
    const [moveOrigStart, setMoveOrigStart] = useState(0);

    // Big-image block: drag-to-resize (duration)
    const [isResizingMedia, setIsResizingMedia] = useState(false);
    const [resizeMediaId, setResizeMediaId] = useState(null);
    const [mediaResizeStartX, setMediaResizeStartX] = useState(0);
    // 'right' = trim from end (change duration); 'left' = trim from start (move the
    // in-point, keep the right edge fixed). init holds values captured at grab time.
    const [mediaResizeMode, setMediaResizeMode] = useState('right');
    const [mediaResizeInit, setMediaResizeInit] = useState({ start: 0, duration: 0, trimStart: 0 });

    // Keyframe diamond: drag-to-retime
    const [isMovingKf, setIsMovingKf] = useState(false);
    const [moveKfItemId, setMoveKfItemId] = useState(null);
    const [moveKfId, setMoveKfId] = useState(null);
    const [kfMoveStartX, setKfMoveStartX] = useState(0);
    const [kfMoveStartT, setKfMoveStartT] = useState(0);

    const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
    // Transition editor popup: which incoming item + where to anchor the panel.
    const [transitionPopup, setTransitionPopup] = useState(null); // { itemId, x, y }
    // Audio trim/cut modal: which segment is open (or null).
    const [audioModalSegIdx, setAudioModalSegIdx] = useState(null);
    const scrollAreaRef = useRef(null);
    const timelineContentRef = useRef(null);
    const playheadRef = useRef(null);
    const timeDisplayRef = useRef(null);

    const totalTime = visualLines.reduce((acc, _, i) => acc + parseFloat(lineSettings[i]?.duration || 0.1), 0);

    // Boundaries where two media items TOUCH — each gets a clickable node to edit
    // the transition (stored on the incoming, i.e. later, item).
    const sortedMedia = [...mediaItems].sort((a, b) => a.start - b.start);
    const mediaBoundaries = [];
    for (let i = 0; i < sortedMedia.length - 1; i++) {
        const A = sortedMedia[i], B = sortedMedia[i + 1];
        if (Math.abs(B.start - (A.start + A.duration)) < 1e-3) {
            mediaBoundaries.push({ time: A.start + A.duration, incomingId: B.id });
        }
    }

    const setItemTransition = (itemId, patch) => {
        setMediaItems(mediaItems.map(m => (
            m.id === itemId ? { ...m, transition: { ...getItemTransition(m), ...patch } } : m
        )));
    };

    const popupItem = transitionPopup ? mediaItems.find(m => m.id === transitionPopup.itemId) : null;
    const popupTr = popupItem ? getItemTransition(popupItem) : null;

    // Close the transition popup on outside-click / Escape.
    useEffect(() => {
        if (!transitionPopup) return;
        const onDown = (e) => { if (!e.target.closest('.transition-popup') && !e.target.closest('.transition-node')) setTransitionPopup(null); };
        const onKey = (e) => { if (e.key === 'Escape') setTransitionPopup(null); };
        window.addEventListener('mousedown', onDown);
        window.addEventListener('keydown', onKey);
        return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
    }, [transitionPopup]);

    useEffect(() => {
        let reqId;
        const loop = () => {
            if (visualLines.length > 0 && playheadRef.current && timelineContentRef.current) {
                const t = currentTimeRef.current;
                playheadRef.current.style.left = `${t * timelineScale}px`;

                if (timeDisplayRef.current) {
                    timeDisplayRef.current.textContent = `${t.toFixed(1)}s`;
                }

                if (isPlaying) {
                    const scrollArea = timelineContentRef.current.parentElement;
                    const px = t * timelineScale;
                    if (px < scrollArea.scrollLeft + 60 || px > scrollArea.scrollLeft + scrollArea.clientWidth - 60) {
                        scrollArea.scrollLeft = px - scrollArea.clientWidth / 2;
                    }
                }
            }
            reqId = requestAnimationFrame(loop);
        };
        reqId = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(reqId);
    }, [isPlaying, visualLines, timelineScale, currentTimeRef]);

    let timeAccumulator = 0;
    const lineBlocks = visualLines.map((line, i) => {
        const dur = parseFloat(lineSettings[i]?.duration || 0.1);
        const text = line.map(span => span.el ? span.el.textContent : '').join(' ');
        const block = {
            index: i,
            start: timeAccumulator,
            duration: dur,
            text: text
        };
        timeAccumulator += dur;
        return block;
    });

    const componentMarkers = [];
    visualLines.forEach((line, i) => {
        const compSpans = line.filter(span => span.el && span.el.classList.contains('inline-comp-span'));
        compSpans.forEach(span => {
            const img = span.el.querySelector('img');
            if (img) {
                // Determine exact time offset within the line based on word index? 
                // For simplicity, we just put it at the line start + a small offset based on index.
                const wordIdx = parseInt(span.el.dataset.wordIdx || 0);
                const lineTotalWords = line.length;
                const offsetDur = lineTotalWords > 0 ? (wordIdx / lineTotalWords) * lineBlocks[i].duration : 0;
                
                componentMarkers.push({
                    id: `marker-${i}-${wordIdx}`,
                    lineIndex: i,
                    start: lineBlocks[i].start + offsetDur,
                    src: img.src
                });
            }
        });
    });

    let currentSegIdx = -1;
    let audioBlockStart = 0;
    let audioBlockDur = 0;
    let hasAudio = false;
    const audioBlocks = [];
    
    for (let i = 0; i < visualLines.length; i++) {
        const segIdx = visualLines[i][0].segIndex;
        const dur = parseFloat(lineSettings[i]?.duration || 0);
        const seg = segments[segIdx];
        
        if (currentSegIdx !== segIdx) {
            if (currentSegIdx !== -1 && hasAudio) {
                audioBlocks.push({ index: currentSegIdx, start: audioBlockStart, duration: audioBlockDur, audioBuffer: segments[currentSegIdx].audioBuffer });
            }
            currentSegIdx = segIdx;
            audioBlockStart = lineBlocks[i].start;
            audioBlockDur = dur;
            hasAudio = seg ? !!seg.audioBuffer : false;
        } else {
            audioBlockDur += dur;
        }
    }
    if (currentSegIdx !== -1 && hasAudio) {
        audioBlocks.push({ index: currentSegIdx, start: audioBlockStart, duration: audioBlockDur, audioBuffer: segments[currentSegIdx].audioBuffer });
    }

    const numTicks = Math.ceil(totalTime) + 2;
    const ticks = Array.from({ length: numTicks }).map((_, i) => i);

    const seekTimeline = (e) => {
        if (!timelineContentRef.current) return;
        const rect = timelineContentRef.current.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const targetTime = Math.max(0, clickX / timelineScale);
        
        currentTimeRef.current = targetTime;
        
        let targetLineIndex = visualLines.length - 1;
        for (let i = 0; i < lineBlocks.length; i++) {
            if (targetTime >= lineBlocks[i].start && targetTime <= lineBlocks[i].start + lineBlocks[i].duration) {
                targetLineIndex = i;
                break;
            }
        }
        if (targetTime === 0) targetLineIndex = 0;
        
        setCurrentLineIndex(targetLineIndex);
        setCurrentSelectionCharIds([]);
        window.dispatchEvent(new CustomEvent('timeupdate-seek'));
    };

    // Move the playhead to an absolute time (used when clicking a keyframe so the
    // preview shows that exact moment).
    const seekToTime = (targetTime) => {
        const t = Math.max(0, targetTime);
        currentTimeRef.current = t;
        let targetLineIndex = visualLines.length - 1;
        for (let i = 0; i < lineBlocks.length; i++) {
            if (t >= lineBlocks[i].start && t <= lineBlocks[i].start + lineBlocks[i].duration) { targetLineIndex = i; break; }
        }
        if (t === 0) targetLineIndex = 0;
        setCurrentLineIndex(targetLineIndex);
        window.dispatchEvent(new CustomEvent('timeupdate-seek'));
    };

    const startKfMove = (item, kf) => (e) => {
        e.stopPropagation();
        if (isPlaying) togglePlayback();
        setSelectedMediaId(item.id);
        setActiveTab('bigMedia');
        setSelectedKeyframeId(kf.id);
        seekToTime(item.start + kf.t * item.duration);
        setIsMovingKf(true);
        setMoveKfItemId(item.id);
        setMoveKfId(kf.id);
        setKfMoveStartX(e.clientX);
        setKfMoveStartT(kf.t);
    };

    useEffect(() => {
        // Magnetic snap: pull a time value to a nearby media edge / 0 / end / playhead.
        const snapTime = (time, excludeId) => {
            const thresh = 8 / timelineScale; // ~8px
            const points = [0, totalTime, currentTimeRef.current];
            for (const m of mediaItems) {
                if (m.id === excludeId) continue;
                points.push(m.start, m.start + m.duration);
            }
            let best = time, bestD = thresh;
            for (const p of points) {
                const d = Math.abs(time - p);
                if (d < bestD) { best = p; bestD = d; }
            }
            return best;
        };

        const handleMouseMove = (e) => {
            if (isResizing) {
                let deltaX = e.clientX - startX;
                let deltaDur = deltaX / timelineScale;
                let newDur = Math.max(0.1, initialDur + deltaDur);
                
                const newSettings = { ...lineSettings };
                const segIdx = visualLines[resizeLineIdx][0].segIndex;
                const seg = segments[segIdx];
        
                if (seg && seg.audioDuration !== null && seg.audioDuration !== undefined) {
                    const segmentLineIndices = [];
                    visualLines.forEach((line, idx) => { if (line[0].segIndex === segIdx) segmentLineIndices.push(idx); });
        
                    if (segmentLineIndices.length > 1) {
                        const oldDur = parseFloat(newSettings[resizeLineIdx].duration);
                        const diff = newDur - oldDur;
                        const localIdx = segmentLineIndices.indexOf(resizeLineIdx);
                        let targetLocalIdx = localIdx + 1;
                        if (targetLocalIdx >= segmentLineIndices.length) targetLocalIdx = localIdx - 1;
                        
                        const targetIdx = segmentLineIndices[targetLocalIdx];
                        let targetDur = parseFloat(newSettings[targetIdx].duration) - diff;
                        
                        if (targetDur < 0.1) {
                            const maxAffordableDiff = parseFloat(newSettings[targetIdx].duration) - 0.1;
                            newDur = oldDur + maxAffordableDiff;
                            targetDur = 0.1;
                        }
                        newSettings[targetIdx].duration = targetDur.toFixed(2);
                        newSettings[resizeLineIdx].duration = newDur.toFixed(2);
                    }
                } else {
                    newSettings[resizeLineIdx].duration = newDur.toFixed(2);
                }
                
                updateLineSettings(visualLines, newSettings, segments);
            } else if (isMovingMedia) {
                const deltaTime = (e.clientX - moveStartX) / timelineScale;
                const current = mediaItems.find(m => m.id === moveMediaId);
                if (current) {
                    let desiredStart = Math.max(0, moveOrigStart + deltaTime);
                    // Snap the closer of the two edges to a nearby edge/marker.
                    const snapStart = snapTime(desiredStart, moveMediaId);
                    const snapEnd = snapTime(desiredStart + current.duration, moveMediaId) - current.duration;
                    desiredStart = Math.abs(snapStart - desiredStart) <= Math.abs(snapEnd - desiredStart) ? snapStart : snapEnd;
                    desiredStart = Math.max(0, desiredStart);
                    const { start, duration } = clampMediaWindow(mediaItems, moveMediaId, desiredStart, current.duration, totalTime);
                    setMediaItems(mediaItems.map(m => m.id === moveMediaId ? { ...m, start, duration } : m));
                }
            } else if (isResizingMedia) {
                const item = mediaItems.find(m => m.id === resizeMediaId);
                if (item) {
                    const dt = (e.clientX - mediaResizeStartX) / timelineScale;
                    const init = mediaResizeInit;
                    const isVideo = item.type === 'video';
                    const vidDur = item.videoDuration || 0;
                    const others = mediaItems.filter(m => m.id !== resizeMediaId);

                    if (mediaResizeMode === 'right') {
                        // Trim from END: start & in-point fixed, only the length changes.
                        let rightLimit = totalTime != null ? totalTime : Infinity;
                        for (const o of others) if (o.start >= init.start) rightLimit = Math.min(rightLimit, o.start - MEDIA_MIN_GAP_SEC);
                        // Snap the right edge to a nearby edge/marker.
                        const snappedEnd = snapTime(init.start + init.duration + dt, resizeMediaId);
                        let newDur = snappedEnd - init.start;
                        // A video can't play past the end of its source.
                        if (isVideo && vidDur > 0) newDur = Math.min(newDur, vidDur - (init.trimStart || 0));
                        newDur = Math.max(0.2, Math.min(newDur, rightLimit - init.start));
                        setMediaItems(mediaItems.map(m => m.id === resizeMediaId ? { ...m, start: init.start, duration: newDur } : m));
                    } else {
                        // Trim from START: the right edge stays put; the in-point (and the
                        // block's timeline start) move together.
                        const rightEdge = init.start + init.duration;
                        let leftLimit = 0;
                        for (const o of others) { const oEnd = o.start + o.duration; if (oEnd <= init.start + 1e-6) leftLimit = Math.max(leftLimit, oEnd + MEDIA_MIN_GAP_SEC); }
                        let minStart = leftLimit;
                        // A video can't reveal earlier than its source start (trimStart >= 0).
                        if (isVideo) minStart = Math.max(minStart, init.start - (init.trimStart || 0));
                        // Snap the left edge to a nearby edge/marker.
                        const snappedStart = snapTime(init.start + dt, resizeMediaId);
                        const newStart = Math.max(minStart, Math.min(snappedStart, rightEdge - 0.2));
                        const patch = { start: newStart, duration: rightEdge - newStart };
                        if (isVideo) patch.trimStart = Math.max(0, (init.trimStart || 0) + (newStart - init.start));
                        setMediaItems(mediaItems.map(m => m.id === resizeMediaId ? { ...m, ...patch } : m));
                    }
                }
            } else if (isMovingKf) {
                const item = mediaItems.find(m => m.id === moveKfItemId);
                if (item && item.duration > 0) {
                    const dt = (e.clientX - kfMoveStartX) / (item.duration * timelineScale);
                    const newT = Math.max(0, Math.min(1, kfMoveStartT + dt));
                    setMediaItems(mediaItems.map(m => m.id === moveKfItemId
                        ? { ...m, keyframes: (m.keyframes || []).map(k => k.id === moveKfId ? { ...k, t: newT } : k) }
                        : m));
                    // Keep the playhead on the keyframe so the preview tracks it.
                    currentTimeRef.current = item.start + newT * item.duration;
                    window.dispatchEvent(new CustomEvent('timeupdate-seek'));
                }
            } else if (isDraggingPlayhead) {
                seekTimeline(e);
            }
        };

        const handleMouseUp = () => {
            if (isResizing) setIsResizing(false);
            if (isDraggingPlayhead) setIsDraggingPlayhead(false);
            if (isMovingMedia) setIsMovingMedia(false);
            if (isResizingMedia) setIsResizingMedia(false);
            if (isMovingKf) setIsMovingKf(false);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
        // eslint-disable-next-line
    }, [
        isResizing, isDraggingPlayhead, startX, initialDur, timelineScale, resizeLineIdx, lineSettings, visualLines, segments,
        isMovingMedia, moveMediaId, moveStartX, moveOrigStart,
        isResizingMedia, resizeMediaId, mediaResizeStartX, mediaResizeMode, mediaResizeInit,
        isMovingKf, moveKfItemId, moveKfId, kfMoveStartX, kfMoveStartT,
        mediaItems, totalTime
    ]);
    // Keyboard shortcuts for the currently selected big image.
    //   Delete / Backspace → remove it
    //   Enter              → open its crop / edit popup
    //   ← / →              → nudge start by 0.1s (hold Shift for 1s)
    //   Ctrl / Cmd + D     → duplicate it right after itself
    //   Escape             → deselect
    useEffect(() => {
        const isTyping = (el) => {
            if (!el) return false;
            const tag = el.tagName;
            return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
        };

        const handleKeyDown = (e) => {
            // Don't hijack keys while typing in a field or the caption editor,
            // and let the crop popup own the keyboard while it's open.
            if (isTyping(document.activeElement)) return;
            if (cropModalMediaId) return;
            if (!selectedMediaId) return;
            const item = mediaItems.find(m => m.id === selectedMediaId);
            if (!item) return;

            if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                // If a keyframe on this image is selected, delete just that keyframe;
                // otherwise delete the whole image.
                if (selectedKeyframeId && (item.keyframes || []).some(k => k.id === selectedKeyframeId)) {
                    setMediaItems(mediaItems.map(m => m.id === selectedMediaId
                        ? { ...m, keyframes: (m.keyframes || []).filter(k => k.id !== selectedKeyframeId) }
                        : m));
                    setSelectedKeyframeId(null);
                } else {
                    setMediaItems(mediaItems.filter(m => m.id !== selectedMediaId));
                    setSelectedMediaId(null);
                    setSelectedKeyframeId(null);
                }
            } else if (e.key === 'k' || e.key === 'K') {
                // Add (or select) a keyframe at the playhead, if it's inside this image.
                const tAbs = currentTimeRef.current;
                if (item.duration > 0 && tAbs >= item.start && tAbs <= item.start + item.duration) {
                    e.preventDefault();
                    const tNorm = (tAbs - item.start) / item.duration;
                    const tEps = clamp((6 / timelineScale) / item.duration, 0.002, 0.06);
                    const existing = keyframeAt(item.keyframes || [], tNorm, tEps);
                    if (existing) {
                        setSelectedKeyframeId(existing.id);
                    } else {
                        const kf = newKeyframe(tNorm, sampleKeyframes(item.keyframes, tNorm, item.crop), item.crop);
                        setMediaItems(mediaItems.map(m => m.id === selectedMediaId
                            ? { ...m, keyframes: [...(m.keyframes || []), kf] } : m));
                        setSelectedKeyframeId(kf.id);
                    }
                }
            } else if (e.key === 'Enter') {
                e.preventDefault();
                setActiveTab('bigMedia');
                setCropModalMediaId(selectedMediaId);
            } else if (e.key === 'Escape') {
                setSelectedMediaId(null);
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                const dir = e.key === 'ArrowLeft' ? -1 : 1;
                const step = (e.shiftKey ? 1 : 0.1) * dir;
                const desiredStart = Math.max(0, item.start + step);
                const { start, duration } = clampMediaWindow(mediaItems, selectedMediaId, desiredStart, item.duration, totalTime);
                setMediaItems(mediaItems.map(m => m.id === selectedMediaId ? { ...m, start, duration } : m));
            } else if ((e.key === 'd' || e.key === 'D') && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                const newId = `bigimg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                const desiredStart = item.start + item.duration;
                const { start, duration } = clampMediaWindow(mediaItems, null, desiredStart, item.duration, totalTime);
                setMediaItems([...mediaItems, { ...item, id: newId, start, duration }]);
                setSelectedMediaId(newId);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedMediaId, selectedKeyframeId, cropModalMediaId, mediaItems, totalTime, timelineScale, currentTimeRef, setMediaItems, setSelectedMediaId, setSelectedKeyframeId, setActiveTab, setCropModalMediaId]);

    useEffect(() => {
        const area = scrollAreaRef.current;
        if (!area) return;

        const handleWheel = (e) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -15 : 15;
                setTimelineScale(prev => Math.max(20, Math.min(250, prev + delta)));
            }
        };

        area.addEventListener('wheel', handleWheel, { passive: false });
        return () => {
            area.removeEventListener('wheel', handleWheel);
        };
    }, [setTimelineScale]);

    return (
        <div className="timeline-container">
            <div className="timeline-header">
                <span>Timeline</span>
                <span className="timeline-time">
                    <strong ref={timeDisplayRef}>0.0s</strong>
                    <span style={{ opacity: 0.5 }}> / {totalTime.toFixed(1)}s</span>
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <label style={{ margin: 0, fontSize: 10, opacity: 0.6 }} title="Ctrl + scroll to zoom">Zoom</label>
                    <input
                        type="range"
                        min="20" max="250"
                        value={timelineScale}
                        onChange={e => setTimelineScale(parseInt(e.target.value))}
                        style={{ width: 100, height: 4 }}
                    />
                </div>
            </div>
            <div className="timeline-scroll-area" ref={scrollAreaRef}>
                <div 
                    className="timeline-content" 
                    id="timeline-content" 
                    ref={timelineContentRef}
                    onMouseDown={(e) => {
                        if (e.target.closest('.resize-handle-right')) return;
                        setIsDraggingPlayhead(true);
                        if (isPlaying) togglePlayback();
                        seekTimeline(e);
                    }}
                    style={{ width: Math.max(100, totalTime * timelineScale + 100) }}
                >
                    <div className="time-ruler">
                        {ticks.map(t => (
                            <div key={t} className="ruler-tick" style={{ left: t * timelineScale }}>
                                <span>{t}s</span>
                            </div>
                        ))}
                    </div>

                    <div 
                        className="playhead" 
                        ref={playheadRef}
                        onMouseDown={(e) => {
                            setIsDraggingPlayhead(true);
                            if (isPlaying) togglePlayback();
                            e.stopPropagation();
                        }}
                    >
                        <div className="playhead-cap"></div>
                        <div className="playhead-hitbox"></div>
                    </div>

                    <div className="tracks-group">
                        {/* Component Markers Layer */}
                        {componentMarkers.map(marker => (
                            <div 
                                key={marker.id}
                                style={{
                                    position: 'absolute',
                                    left: marker.start * timelineScale,
                                    top: -30,
                                    width: 24,
                                    height: 24,
                                    transform: 'translateX(-50%)',
                                    zIndex: 10
                                }}
                            >
                                <div style={{
                                    width: '100%', height: '100%', background: 'var(--bg-input)', borderRadius: '4px', border: '1px solid var(--border)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden'
                                }}>
                                    <img src={marker.src} alt="marker" style={{ width: 16, height: 16, objectFit: 'contain' }} />
                                </div>
                                {/* Connecting string */}
                                <div style={{
                                    position: 'absolute',
                                    left: '50%',
                                    top: '100%',
                                    width: 1,
                                    height: 38, /* Reaches down to the text block */
                                    background: 'var(--border)',
                                    transform: 'translateX(-50%)'
                                }}></div>
                            </div>
                        ))}

                        <div className="track text-track" data-label="Text Lines">
                            {lineBlocks.map(lb => (
                                <div 
                                    key={lb.index} 
                                    className={`timeline-block text-block ${lb.index === currentLineIndex ? 'active' : ''}`} 
                                    onMouseDown={(e) => {
                                        if (e.target.closest('.resize-handle-right')) return;
                                        if (isPlaying) togglePlayback();
                                        setCurrentLineIndex(lb.index);
                                        e.stopPropagation();
                                    }}
                                    style={{ 
                                        left: lb.start * timelineScale, width: lb.duration * timelineScale, top: 0, height: '100%'
                                    }}
                                >
                                    <span className="block-text-label">{lb.text}</span>
                                    <div 
                                        className="resize-handle-right" 
                                        onMouseDown={(e) => {
                                            e.stopPropagation();
                                            setIsResizing(true);
                                            setResizeLineIdx(lb.index);
                                            setStartX(e.clientX);
                                            setInitialDur(lb.duration);
                                            if (isPlaying) togglePlayback();
                                        }}
                                    />
                                </div>
                            ))}
                        </div>

                        <div className="track audio-track" data-label="Audio">
                            {audioBlocks.map(ab => {
                                const blockWidth = Math.max(1, ab.duration * timelineScale - 1);
                                const trimmed = segments[ab.index]?.audioEdit && (segments[ab.index].audioEdit.cuts?.length || (segments[ab.index].audioEdit.start ?? 0) > 0.01 || (segments[ab.index].audioEdit.end ?? ab.audioBuffer?.duration) < (ab.audioBuffer?.duration ?? 0) - 0.01);
                                return (
                                    <div
                                        key={ab.index}
                                        className={`timeline-block audio-block ${trimmed ? 'edited' : ''}`}
                                        style={{ left: ab.start * timelineScale, width: blockWidth, top: 0, padding: 0, height: '100%' }}
                                        title="Double-click to trim / cut this audio"
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onDoubleClick={(e) => { e.stopPropagation(); if (isPlaying) togglePlayback(); setAudioModalSegIdx(ab.index); }}
                                    >
                                        <AudioWaveform
                                            audioBuffer={getEditedBuffer(getAudioCtx(), ab.audioBuffer, segments[ab.index]?.audioEdit)}
                                            width={blockWidth}
                                            height={28}
                                        />
                                    </div>
                                );
                            })}
                        </div>

                        <div className="track media-track" data-label="Big Images">
                            {mediaItems.map(item => (
                                <div
                                    key={item.id}
                                    className={`timeline-block media-block ${activeMediaId === item.id ? 'active' : ''} ${selectedMediaId === item.id ? 'selected' : ''}`}
                                    title="Double-click to crop · K adds a pan/zoom keyframe at the playhead · Delete removes · ←/→ nudge"
                                    style={{ left: item.start * timelineScale, width: Math.max(4, item.duration * timelineScale), top: 0, height: '100%' }}
                                    onMouseDown={(e) => {
                                        if (e.target.closest('.resize-handle-right')) return;
                                        if (e.target.closest('.resize-handle-left')) return;
                                        if (e.target.closest('.kf-diamond')) return;
                                        if (isPlaying) togglePlayback();
                                        setSelectedMediaId(item.id);
                                        setSelectedKeyframeId(null);
                                        setActiveTab('bigMedia');
                                        setIsMovingMedia(true);
                                        setMoveMediaId(item.id);
                                        setMoveStartX(e.clientX);
                                        setMoveOrigStart(item.start);
                                        e.stopPropagation();
                                    }}
                                    onDoubleClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedMediaId(item.id);
                                        setActiveTab('bigMedia');
                                        setCropModalMediaId(item.id);
                                    }}
                                >
                                    {item.type === 'video'
                                        ? <video src={item.src} className="media-block-thumb" muted preload="metadata" />
                                        : <img src={item.src} alt="" className="media-block-thumb" />}
                                    <span className="block-text-label">{item.type === 'video' ? 'Video' : 'Image'}</span>

                                    {/* Pan/zoom keyframes — visible & editable when this image is selected */}
                                    {selectedMediaId === item.id && (item.keyframes || []).map(kf => (
                                        <div
                                            key={kf.id}
                                            className={`kf-diamond ${selectedKeyframeId === kf.id ? 'selected' : ''}`}
                                            style={{ left: `${kf.t * 100}%` }}
                                            title={`${(item.start + kf.t * item.duration).toFixed(2)}s · ${kf.scale.toFixed(2)}x`}
                                            onMouseDown={startKfMove(item, kf)}
                                        />
                                    ))}

                                    {/* Videos can be trimmed from the start too (in-point). */}
                                    {item.type === 'video' && (
                                        <div
                                            className="resize-handle-left"
                                            title="Trim from start"
                                            onMouseDown={(e) => {
                                                e.stopPropagation();
                                                setSelectedMediaId(item.id);
                                                setIsResizingMedia(true);
                                                setResizeMediaId(item.id);
                                                setMediaResizeMode('left');
                                                setMediaResizeStartX(e.clientX);
                                                setMediaResizeInit({ start: item.start, duration: item.duration, trimStart: item.trimStart || 0 });
                                                if (isPlaying) togglePlayback();
                                            }}
                                        />
                                    )}
                                    <div
                                        className="resize-handle-right"
                                        title={item.type === 'video' ? 'Trim from end' : 'Resize'}
                                        onMouseDown={(e) => {
                                            e.stopPropagation();
                                            setSelectedMediaId(item.id);
                                            setIsResizingMedia(true);
                                            setResizeMediaId(item.id);
                                            setMediaResizeMode('right');
                                            setMediaResizeStartX(e.clientX);
                                            setMediaResizeInit({ start: item.start, duration: item.duration, trimStart: item.trimStart || 0 });
                                            if (isPlaying) togglePlayback();
                                        }}
                                    />
                                </div>
                            ))}

                            {/* Transition node between two touching media items. Click to
                                pick a transition type + duration for the hand-off. */}
                            {mediaBoundaries.map(b => {
                                const tr = getItemTransition(mediaItems.find(m => m.id === b.incomingId));
                                const isOpen = transitionPopup?.itemId === b.incomingId;
                                return (
                                    <div
                                        key={b.incomingId}
                                        className={`transition-node ${isOpen ? 'open' : ''} ${tr.type === 'cut' ? 'cut' : ''}`}
                                        style={{ left: b.time * timelineScale }}
                                        title={`Transition: ${tr.type}${tr.type === 'cut' ? '' : ' · ' + tr.durationMs + 'ms'}`}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const r = e.currentTarget.getBoundingClientRect();
                                            setTransitionPopup({ itemId: b.incomingId, x: r.left + r.width / 2, y: r.top });
                                        }}
                                    >
                                        <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                                            <path d="M9 7L4 12l5 5V7zm6 0v10l5-5-5-5z" />
                                        </svg>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {audioModalSegIdx !== null && (
                <AudioTrimModal segIdx={audioModalSegIdx} onClose={() => setAudioModalSegIdx(null)} />
            )}

            {transitionPopup && popupTr && (
                <div
                    className="transition-popup"
                    style={{ left: clamp(transitionPopup.x, 150, window.innerWidth - 150), top: transitionPopup.y - 12 }}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <div className="transition-popup-title">Transition</div>
                    <div className="transition-type-grid">
                        {MEDIA_TRANSITION_TYPES.map(t => (
                            <button
                                key={t.id}
                                className={`transition-type-btn ${popupTr.type === t.id ? 'active' : ''}`}
                                onClick={() => setItemTransition(transitionPopup.itemId, {
                                    type: t.id,
                                    // Give a real length when leaving 'cut'; 'cut' forces 0.
                                    durationMs: t.id === 'cut' ? 0 : (popupTr.durationMs > 0 ? popupTr.durationMs : 500)
                                })}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                    <div className={`transition-duration-row ${popupTr.type === 'cut' ? 'disabled' : ''}`}>
                        <label>Duration</label>
                        <input
                            type="range" min="80" max="2000" step="20"
                            value={popupTr.durationMs || 0}
                            disabled={popupTr.type === 'cut'}
                            onChange={(e) => setItemTransition(transitionPopup.itemId, { durationMs: parseInt(e.target.value) })}
                        />
                        <input
                            type="number" min="0" max="4000" step="10"
                            className="transition-ms-input"
                            value={popupTr.durationMs || 0}
                            disabled={popupTr.type === 'cut'}
                            onChange={(e) => setItemTransition(transitionPopup.itemId, { durationMs: Math.max(0, parseInt(e.target.value) || 0) })}
                        />
                        <span className="transition-ms-unit">ms</span>
                    </div>
                </div>
            )}
        </div>
    );
};
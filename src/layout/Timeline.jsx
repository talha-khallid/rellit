import React, { useContext, useRef, useState, useEffect } from 'react';
import { EditorContext } from '../context/EditorContext';
import { AudioWaveform } from '../components/AudioWaveform';

export const Timeline = () => {
    const { 
        segments, visualLines, lineSettings, updateLineSettings,
        isPlaying, togglePlayback,
        currentLineIndex, setCurrentLineIndex,
        timelineScale, setTimelineScale,
        setCurrentSelectionCharIds,
        currentTimeRef
    } = useContext(EditorContext);

    const [isResizing, setIsResizing] = useState(false);
    const [resizeLineIdx, setResizeLineIdx] = useState(-1);
    const [startX, setStartX] = useState(0);
    const [initialDur, setInitialDur] = useState(0);
    
    const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
    const scrollAreaRef = useRef(null);
    const timelineContentRef = useRef(null);
    const playheadRef = useRef(null);

    const totalTime = visualLines.reduce((acc, _, i) => acc + parseFloat(lineSettings[i]?.duration || 0.1), 0);

    useEffect(() => {
        let reqId;
        const loop = () => {
            if (visualLines.length > 0 && playheadRef.current && timelineContentRef.current) {
                const t = currentTimeRef.current;
                playheadRef.current.style.left = `${t * timelineScale}px`;

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
        const text = line.map(span => span.text).join(' ');
        const block = {
            index: i,
            start: timeAccumulator,
            duration: dur,
            text: text
        };
        timeAccumulator += dur;
        return block;
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

    useEffect(() => {
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
            } else if (isDraggingPlayhead) {
                seekTimeline(e);
            }
        };

        const handleMouseUp = () => {
            if (isResizing) setIsResizing(false);
            if (isDraggingPlayhead) setIsDraggingPlayhead(false);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
        // eslint-disable-next-line
    }, [isResizing, isDraggingPlayhead, startX, initialDur, timelineScale, resizeLineIdx, lineSettings, visualLines, segments]);
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
                <span>Timeline Sync</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <label style={{ margin: 0, fontSize: 10, opacity: 0.6 }}>ZOOM</label>
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
                            {audioBlocks.map(ab => (
                                <div key={ab.index} className="timeline-block audio-block" style={{ left: ab.start * timelineScale, width: ab.duration * timelineScale, top: 0, padding: 0, height: '100%' }}>
                                    <AudioWaveform 
                                        audioBuffer={ab.audioBuffer} 
                                        width={ab.duration * timelineScale} 
                                        height={28} 
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
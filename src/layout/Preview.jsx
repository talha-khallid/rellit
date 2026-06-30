import React, { useContext, useEffect, useRef, useLayoutEffect, useState } from 'react';
import { EditorContext } from '../context/EditorContext';

export const Preview = ({ setScrollBox, setCharsData, setImagesData }) => {
    const { 
        segments, visualLines, setVisualLines, 
        lineSettings, updateLineSettings,
        isPlaying, togglePlayback,
        currentLineIndex, setCurrentLineIndex,
        currentSelectionCharIds, setCurrentSelectionCharIds,
        globalAudioObj, setGlobalAudioObj,
        currentlyPlayingSegIdx, setCurrentlyPlayingSegIdx,
        charOverrides,
        currentTimeRef, lastFrameTimeRef,
        timelineScale,
        getAudioCtx, AudioBufferPlayer,
        videoBgColor, videoAlignPercent,
        fontFamily, fontWeight, textTransform, fontSize, textAlign, letterSpacing,
        customComponents, setCustomComponents, setSegments,
        armedComponentId, setArmedComponentId
    } = useContext(EditorContext);

    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isLooping, setIsLooping] = useState(true);
    const [currentTimeDisplay, setCurrentTimeDisplay] = useState('00:00');
    const [totalTimeDisplay, setTotalTimeDisplay] = useState('00:00');
    
    // Track the active audio player inside the closure safely
    const currentAudioRef = useRef(null);

    const trackRef = useRef(null);
    const scrollContainerRef = useRef(null);
    const screenRef = useRef(null);
    const containerRef = useRef(null);
    const [screenScale, setScreenScale] = useState(1);
    
    const lineTimerRef = useRef(null);
    const [renderedWords, setRenderedWords] = useState([]);

    const formatTime = (secs) => {
        if (isNaN(secs) || secs < 0) return '00:00';
        const m = Math.floor(secs / 60).toString().padStart(2, '0');
        const s = Math.floor(secs % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    const getTotalDuration = () => {
        return visualLines.reduce((acc, _, i) => acc + parseFloat(lineSettings[i]?.duration || 0.1), 0);
    };

    // React Fullscreen Handler
    const toggleFullscreen = () => {
        setIsFullscreen(!isFullscreen);
    };

    // Global Paste handler for components
    useEffect(() => {
        const handleGlobalPaste = (e) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            
            let imageItem = null;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    imageItem = items[i];
                    break;
                }
            }
            if (!imageItem) return;

            const blob = imageItem.getAsFile();
            const reader = new FileReader();
            reader.onload = (evt) => {
                const src = evt.target.result;
                const newCompId = `comp_${Date.now()}`;
                
                setCustomComponents(prev => [...prev, {
                    id: newCompId,
                    src,
                    size: 40,
                    animation: 'pop-rotate'
                }]);

                // Determine insertion text segment
                let targetSegIndex = -1;
                let newText = '';
                
                if (currentSelectionCharIds.length > 0) {
                    // Find which segment has the selected character
                    const selectedCharId = currentSelectionCharIds[0];
                    const selectedWord = renderedWords.find(w => !w.isComponent && (w.chars.some(c => c.id === selectedCharId) || w.spaceId === selectedCharId));
                    if (selectedWord) {
                        targetSegIndex = selectedWord.segIndex;
                        const wordIdx = renderedWords.indexOf(selectedWord);
                        const wordsInSeg = renderedWords.filter(w => w.segIndex === targetSegIndex);
                        
                        // Reconstruct text up to the word
                        const localWordIdx = wordsInSeg.indexOf(selectedWord);
                        const textBefore = wordsInSeg.slice(0, localWordIdx + 1).map(w => w.isComponent ? `[COMP:${w.componentId}]` : w.chars.map(c => c.char).join('')).join(' ');
                        const textAfter = wordsInSeg.slice(localWordIdx + 1).map(w => w.isComponent ? `[COMP:${w.componentId}]` : w.chars.map(c => c.char).join('')).join(' ');
                        
                        newText = textBefore + ` [COMP:${newCompId}]  ` + textAfter;
                    }
                }
                
                if (targetSegIndex === -1 && visualLines[currentLineIndex]) {
                    // Append to the first segment of the active line if no word selected
                    targetSegIndex = visualLines[currentLineIndex][0].segIndex;
                    newText = segments[targetSegIndex].text + ` [COMP:${newCompId}]  `;
                }

                if (targetSegIndex !== -1) {
                    const newSegments = [...segments];
                    newSegments[targetSegIndex] = { ...newSegments[targetSegIndex], text: newText.trim() };
                    setSegments(newSegments);
                }
            };
            reader.readAsDataURL(blob);
        };
        
        // Add to document
        document.addEventListener('paste', handleGlobalPaste);
        return () => document.removeEventListener('paste', handleGlobalPaste);
    }, [segments, currentLineIndex, currentSelectionCharIds, renderedWords, visualLines, setCustomComponents, setSegments]);

    useEffect(() => {
        const words = [];
        let globalCharIndex = 0;
        
        segments.forEach((seg, segIndex) => {
            const rawTokens = seg.text.split(' ');
            const parsedWords = [];
            
            rawTokens.forEach((token) => {
                if (token === '') {
                    parsedWords.push({ text: '', hasNewlineAfter: false });
                    return;
                }
                const parts = token.split('\n');
                parts.forEach((part, i) => {
                    if (part !== '') {
                        parsedWords.push({ text: part, hasNewlineAfter: i < parts.length - 1 });
                    } else if (i < parts.length - 1) {
                         if (parsedWords.length > 0) {
                             parsedWords[parsedWords.length - 1].hasNewlineAfter = true;
                         }
                    }
                });
            });

            if (parsedWords.length === 0) return;

            const realWordsCount = Math.max(1, parsedWords.filter(pw => pw.text !== '').length);
            const timePerWord = parseFloat(seg.duration) / realWordsCount;
            
            parsedWords.forEach((pw, wordIndex) => {
                const compMatch = pw.text.match(/^\[COMP:(comp_[0-9]+)\]$/);
                if (compMatch) {
                    words.push({
                        isComponent: true,
                        componentId: compMatch[1],
                        baseDuration: timePerWord,
                        segIndex,
                        isLastInSeg: wordIndex === parsedWords.length - 1,
                        hasNewlineAfter: pw.hasNewlineAfter,
                        spaceId: globalCharIndex++
                    });
                } else if (pw.text === '') {
                    words.push({
                        isExtraSpace: true,
                        spaceId: globalCharIndex++,
                        baseDuration: 0,
                        segIndex,
                        isLastInSeg: wordIndex === parsedWords.length - 1,
                        hasNewlineAfter: pw.hasNewlineAfter
                    });
                } else {
                    const chars = pw.text.split('').map(char => ({ char, id: globalCharIndex++ }));
                    words.push({
                        chars,
                        spaceId: globalCharIndex++,
                        baseDuration: timePerWord,
                        segIndex,
                        isLastInSeg: wordIndex === parsedWords.length - 1,
                        hasNewlineAfter: pw.hasNewlineAfter
                    });
                }
            });
        });
        
        setRenderedWords(words);
    }, [segments]);

    useLayoutEffect(() => {
        if (!trackRef.current) return;
        
        if (renderedWords.length === 0) {
            setVisualLines([]);
            updateLineSettings([], lineSettings, segments);
            return;
        }
        
        const calculateVisualLines = () => {
            if (!trackRef.current) return;
            const wordSpans = trackRef.current.querySelectorAll('.word');
            const newVisualLines = [];
            let currentLine = [];
            let currentOffsetTop = -1;
            
            wordSpans.forEach(span => {
                const offsetTop = span.offsetTop;
                if (currentOffsetTop === -1 || Math.abs(offsetTop - currentOffsetTop) > Math.max(10, fontSize * 0.5)) {
                    if (currentLine.length > 0) newVisualLines.push(currentLine);
                    currentLine = [{
                        el: span,
                        segIndex: parseInt(span.dataset.segIndex),
                        baseDuration: parseFloat(span.dataset.baseDuration),
                        offsetTop,
                        offsetHeight: span.offsetHeight
                    }];
                    currentOffsetTop = offsetTop;
                } else {
                    currentLine.push({
                        el: span,
                        segIndex: parseInt(span.dataset.segIndex),
                        baseDuration: parseFloat(span.dataset.baseDuration),
                        offsetTop,
                        offsetHeight: span.offsetHeight
                    });
                }
            });
            if (currentLine.length > 0) newVisualLines.push(currentLine);
            
            setVisualLines(newVisualLines);
            updateLineSettings(newVisualLines, lineSettings, segments);
        };

        calculateVisualLines();
        let resizeTimeout;
        const handleResize = () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(calculateVisualLines, 50);
        };

        window.addEventListener('resize', handleResize);
        document.fonts.ready.then(calculateVisualLines);
        const fallbackTimer = setTimeout(calculateVisualLines, 200);

        return () => {
            window.removeEventListener('resize', handleResize);
            clearTimeout(resizeTimeout);
            clearTimeout(fallbackTimer);
        };
        // eslint-disable-next-line
    }, [renderedWords, setVisualLines, fontFamily, fontWeight, textTransform, fontSize, textAlign, letterSpacing]);

    useEffect(() => {
        if (visualLines.length === 0 || !trackRef.current || !scrollContainerRef.current) return;
        
        const activeLineSpans = visualLines[currentLineIndex];
        if (!activeLineSpans || activeLineSpans.length === 0) return;

        const containerHeight = scrollContainerRef.current.clientHeight;
        const lineTop = activeLineSpans[0].offsetTop;
        const lineHeight = activeLineSpans[0].offsetHeight;
        
        const translation = (containerHeight / 2) - (lineTop + lineHeight / 2);
        trackRef.current.style.transform = `translateY(${translation}px)`;
        
    }, [currentLineIndex, visualLines]);

    useLayoutEffect(() => {
        const updateScreenScale = () => {
            if (!containerRef.current || !screenRef.current) return;
            const containerHeight = containerRef.current.clientHeight - (isFullscreen ? 0 : 48); 
            const scale = containerHeight / 1920;
            setScreenScale(scale);
        };
        
        updateScreenScale();
        window.addEventListener('resize', updateScreenScale);
        const t1 = setTimeout(updateScreenScale, 50);
        
        return () => {
            window.removeEventListener('resize', updateScreenScale);
            clearTimeout(t1);
        };
    }, [isFullscreen, visualLines, lineSettings]);

    // --- TIME-BASED PLAYBACK ENGINE ---
    useEffect(() => {
        let frameId;
        
        if (!isPlaying || visualLines.length === 0) {
            if (currentAudioRef.current) {
                currentAudioRef.current.pause();
                currentAudioRef.current = null;
            }
            if (globalAudioObj) globalAudioObj.pause();
            setCurrentTimeDisplay(formatTime(currentTimeRef.current));
            setTotalTimeDisplay(formatTime(getTotalDuration()));
            return;
        }

        // Start playing
        lastFrameTimeRef.current = performance.now();
        
        // Initial Audio Setup for the current exact time
        let absoluteSegmentStart = 0;
        let currentSegIdx = -1;
        let acc = 0;
        for (let i = 0; i < visualLines.length; i++) {
            const dur = parseFloat(lineSettings[i]?.duration || 0.1);
            if (currentTimeRef.current >= acc && currentTimeRef.current < acc + dur) {
                currentSegIdx = visualLines[i][0].segIndex;
                break;
            }
            acc += dur;
        }
        
        // Calculate absolute start of the segment
        for (let i = 0; i < visualLines.length; i++) {
            if (visualLines[i][0].segIndex < currentSegIdx) {
                absoluteSegmentStart += parseFloat(lineSettings[i]?.duration || 0.1);
            }
        }

        if (currentSegIdx !== -1) {
            setCurrentlyPlayingSegIdx(currentSegIdx);
            const seg = segments[currentSegIdx];
            if (currentAudioRef.current) {
                currentAudioRef.current.pause();
                currentAudioRef.current = null;
            }
            if (globalAudioObj) {
                globalAudioObj.pause();
                setGlobalAudioObj(null);
            }
            if (seg && seg.audioBuffer) {
                const offsetTime = currentTimeRef.current - absoluteSegmentStart;
                const audioCtx = getAudioCtx();
                const player = new AudioBufferPlayer(audioCtx, seg.audioBuffer);
                player.play(Math.max(0, offsetTime));
                currentAudioRef.current = player;
                setGlobalAudioObj(player);
            }
        }

        setCurrentSelectionCharIds([]); 

        const tick = () => {
            const now = performance.now();
            const delta = (now - lastFrameTimeRef.current) / 1000;
            lastFrameTimeRef.current = now;
            
            currentTimeRef.current += delta;
            const totalDur = getTotalDuration();
            
            if (currentTimeRef.current >= totalDur) {
                if (isLooping) {
                    currentTimeRef.current = 0;
                    // To cleanly restart audio, we toggle playback off then on next frame
                    togglePlayback();
                    setTimeout(togglePlayback, 10);
                    return;
                } else {
                    currentTimeRef.current = totalDur;
                    togglePlayback();
                    return;
                }
            }

            // Sync visual displays
            setCurrentTimeDisplay(formatTime(currentTimeRef.current));
            setTotalTimeDisplay(formatTime(totalDur));

            // Sync Line Index
            let tAcc = 0;
            let newIdx = 0;
            let newSegIdx = -1;
            for (let i = 0; i < visualLines.length; i++) {
                const dur = parseFloat(lineSettings[i]?.duration || 0.1);
                if (currentTimeRef.current >= tAcc && currentTimeRef.current < tAcc + dur) {
                    newIdx = i;
                    newSegIdx = visualLines[i][0].segIndex;
                    break;
                }
                tAcc += dur;
            }

            setCurrentLineIndex(prev => {
                if (prev !== newIdx) {
                    // We crossed a line boundary.
                    // Did we also cross a segment boundary? If so, audio needs to switch.
                    setCurrentlyPlayingSegIdx(prevSeg => {
                        if (prevSeg !== newSegIdx) {
                            // Stop current audio, next tick or effect should start new audio
                            // Actually it's easier to let a separate effect handle audio segment switching,
                            // or just toggle playback quickly to reset the play loop.
                            // For a clean architecture, we'll do the audio swap right here.
                            const seg = segments[newSegIdx];
                            if (currentAudioRef.current) {
                                currentAudioRef.current.pause();
                                currentAudioRef.current = null;
                            }
                            if (globalAudioObj) {
                                globalAudioObj.pause();
                                setGlobalAudioObj(null);
                            }
                            if (seg && seg.audioBuffer) {
                                const audioCtx = getAudioCtx();
                                const player = new AudioBufferPlayer(audioCtx, seg.audioBuffer);
                                player.play(0); // starting exactly at the segment boundary
                                currentAudioRef.current = player;
                                setGlobalAudioObj(player);
                            }
                            return newSegIdx;
                        }
                        return prevSeg;
                    });
                }
                return newIdx;
            });

            frameId = requestAnimationFrame(tick);
        };

        frameId = requestAnimationFrame(tick);

        return () => {
            cancelAnimationFrame(frameId);
        };
        // eslint-disable-next-line
    }, [isPlaying, isLooping, visualLines, segments]);

    useEffect(() => {
        const handleSeek = () => {
            if (!isPlaying) {
                setCurrentTimeDisplay(formatTime(currentTimeRef.current));
                setTotalTimeDisplay(formatTime(getTotalDuration()));
            }
        };
        window.addEventListener('timeupdate-seek', handleSeek);
        return () => window.removeEventListener('timeupdate-seek', handleSeek);
    }, [isPlaying, getTotalDuration]);

    // Navigation Helpers
    const setTimeAndSync = (newTime) => {
        let t = Math.max(0, Math.min(newTime, getTotalDuration()));
        currentTimeRef.current = t;
        
        let tAcc = 0;
        let newIdx = 0;
        for (let i = 0; i < visualLines.length; i++) {
            const dur = parseFloat(lineSettings[i]?.duration || 0.1);
            if (t >= tAcc && t < tAcc + dur) {
                newIdx = i;
                break;
            }
            tAcc += dur;
        }
        setCurrentLineIndex(newIdx);
        setCurrentTimeDisplay(formatTime(t));
    };

    const skipNextLine = () => {
        if (visualLines.length === 0) return;
        let nextIdx = currentLineIndex + 1;
        if (nextIdx >= visualLines.length) nextIdx = 0;
        
        let tAcc = 0;
        for(let i=0; i<nextIdx; i++) tAcc += parseFloat(lineSettings[i]?.duration || 0.1);
        setTimeAndSync(tAcc);
    };

    const skipPrevLine = () => {
        if (visualLines.length === 0) return;
        let prevIdx = currentLineIndex - 1;
        if (prevIdx < 0) prevIdx = visualLines.length - 1;
        
        let tAcc = 0;
        for(let i=0; i<prevIdx; i++) tAcc += parseFloat(lineSettings[i]?.duration || 0.1);
        setTimeAndSync(tAcc);
    };

    const scrubToLine = (offset) => {
        let targetIdx = currentLineIndex + offset;
        if (targetIdx < 0) targetIdx = 0;
        if (targetIdx >= visualLines.length) targetIdx = visualLines.length - 1;
        
        let tAcc = 0;
        for(let i=0; i<targetIdx; i++) tAcc += parseFloat(lineSettings[i]?.duration || 0.1);
        setTimeAndSync(tAcc);
        setCurrentSelectionCharIds([]);
    };

    const captureExportGeometry = () => {
        if (!screenRef.current || !scrollContainerRef.current || !trackRef.current || visualLines.length === 0) return;

        const screenEl = screenRef.current;
        const originalParent = screenEl.parentNode;
        const originalNextSibling = screenEl.nextSibling;
        const originalCssText = screenEl.style.cssText;
        
        const wrapperEl = screenEl.querySelector('.caption-wrapper');
        const originalWrapperCss = wrapperEl ? wrapperEl.style.cssText : '';
        const trackEl = trackRef.current;

        document.body.appendChild(screenEl);

        screenEl.style.cssText = `width: 1080px !important; height: 1920px !important; max-width: none !important; position: absolute !important; top: 0 !important; left: 0 !important; z-index: -1000 !important; transform: scale(1) !important; display: block !important; background-color: ${videoBgColor} !important; border-radius: 0 !important; font-family: ${fontFamily} !important; letter-spacing: ${letterSpacing}px !important; text-transform: ${textTransform} !important; text-align: ${textAlign} !important;`;
        if (wrapperEl) {
            wrapperEl.style.cssText = `position: absolute !important; top: ${videoAlignPercent}% !important; transform: translateY(-50%) !important; left: 0 !important; width: 100% !important; padding-left: 54px !important; padding-right: 157px !important; box-sizing: border-box !important; font-size: ${fontSize}px !important; line-height: 1.45 !important;`;
        }
        
        const originalTrackTransform = trackEl.style.transform;
        trackEl.style.transform = 'translateY(0px)';

        screenEl.getBoundingClientRect();

        const screenRect = screenEl.getBoundingClientRect();
        const scrollRect = scrollContainerRef.current.getBoundingClientRect();
        
        setScrollBox({ 
            x: scrollRect.left - screenRect.left, 
            y: scrollRect.top - screenRect.top, 
            w: scrollRect.width, 
            h: scrollRect.height 
        });

        const wordToLineIdx = new Map();
        visualLines.forEach((lineSpans, lineIdx) => { 
            lineSpans.forEach(wordSpan => wordToLineIdx.set(wordSpan.el, lineIdx)); 
        });

        const charEls = Array.from(trackEl.querySelectorAll('.char'));
        const charsData = charEls.map(c => {
            const rect = c.getBoundingClientRect();
            const wordSpan = c.closest('.word');
            return { 
                text: c.textContent, 
                baseX: rect.left - screenRect.left, 
                baseY: rect.top - screenRect.top, 
                lineIdx: wordToLineIdx.get(wordSpan), 
                overrideColor: c.dataset.overrideColor 
            };
        });

        const imgEls = Array.from(trackEl.querySelectorAll('.inline-component'));

        const imagesData = imgEls.map((img) => {
            const rect = img.getBoundingClientRect();
            const wordSpan = img.closest('.word');
            
            let scale = 1;
            const match = img.style.transform.match(/scale\(([\d.]+)\)/);
            if (match) {
                scale = parseFloat(match[1]);
            }
            
            const trueWidth = parseInt(img.style.width) || (rect.width / scale);
            const trueHeight = parseInt(img.style.height) || (rect.height / scale);
            
            const centerX = rect.left + (rect.width / 2);
            const centerY = rect.top + (rect.height / 2);
            
            const baseX = centerX - (trueWidth / 2) - screenRect.left;
            const baseY = centerY - (trueHeight / 2) - screenRect.top;

            return {
                src: img.src,
                baseX,
                baseY,
                width: trueWidth,
                height: trueHeight,
                lineIdx: wordToLineIdx.get(wordSpan),
                animation: img.dataset.animation || 'none'
            };
        });

        setCharsData(charsData);
        if (setImagesData) setImagesData(imagesData);

        screenEl.style.cssText = originalCssText;
        if (wrapperEl) wrapperEl.style.cssText = originalWrapperCss;
        trackEl.style.transform = originalTrackTransform;

        if (originalNextSibling) {
            originalParent.insertBefore(screenEl, originalNextSibling);
        } else {
            originalParent.appendChild(screenEl);
        }
    };

    useEffect(() => {
        if (visualLines.length > 0) {
            setTimeout(captureExportGeometry, 40);
        }
        // eslint-disable-next-line
    }, [visualLines, charOverrides, lineSettings, screenScale, videoBgColor, videoAlignPercent, fontFamily, fontWeight, textTransform, fontSize, textAlign, letterSpacing, customComponents]);

    useEffect(() => {
        const handleSelection = () => {
            if (isPlaying) return;
            const selection = window.getSelection();
            if (!selection.rangeCount || !trackRef.current?.contains(selection.anchorNode)) return;

            if (selection.isCollapsed) {
                if (currentSelectionCharIds.length > 0) setCurrentSelectionCharIds([]);
                return;
            }

            const charSpans = trackRef.current.querySelectorAll('.word.active-word .char');
            const selectedIds = [];
            charSpans.forEach(span => {
                if (selection.containsNode(span, true)) {
                    selectedIds.push(parseInt(span.dataset.charId));
                }
            });

            if (selectedIds.join(',') !== currentSelectionCharIds.join(',')) {
                setCurrentSelectionCharIds(selectedIds);
            }
        };

        document.addEventListener('selectionchange', handleSelection);
        return () => document.removeEventListener('selectionchange', handleSelection);
    }, [isPlaying, currentSelectionCharIds, setCurrentSelectionCharIds]);

    let selectionHasUniformOverride = false;
    if (currentSelectionCharIds.length > 0) {
        const firstId = currentSelectionCharIds[0];
        const firstColor = charOverrides[firstId];
        if (firstColor) {
            selectionHasUniformOverride = currentSelectionCharIds.every(id => charOverrides[id] === firstColor);
        }
    }

    return (
        <div 
            ref={containerRef}
            className="center-preview" 
            style={{ 
                backgroundColor: '#000000',
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                height: '100%',
                width: '100%',
                overflow: 'hidden',
                ...(isFullscreen ? {
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    zIndex: 99999,
                    background: '#000000'
                } : { position: 'relative' })
            }} 
            onMouseDown={(e) => {
                // Deselect logic when clicking empty space
                if (!e.target.closest('.word') && !isPlaying) {
                    window.getSelection().removeAllRanges();
                    setCurrentSelectionCharIds([]);
                }
            }}
        >
            <div 
                style={{ 
                    flex: 1, 
                    width: '100%', 
                    position: 'relative', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    background: '#000000'
                }}
            >
                {/* Custom Global Cursor for Armed Component */}
                {armedComponentId && (
                    <div id="preview-armed-cursor" style={{
                        position: 'fixed', pointerEvents: 'none', zIndex: 999999,
                        width: 14, height: 14, borderRadius: '50%', background: 'var(--accent)',
                        border: '2px solid #fff', boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                        transform: 'translate(10px, 10px)'
                    }}></div>
                )}
                <div 
                    className="mobile-screen-container" 
                    onMouseMove={(e) => {
                        if (armedComponentId) {
                            const dot = document.getElementById('preview-armed-cursor');
                            if (dot) {
                                dot.style.left = `${e.clientX}px`;
                                dot.style.top = `${e.clientY}px`;
                            }
                        }
                    }}
                    style={{ 
                        position: 'relative', 
                        height: '100%',
                        aspectRatio: '9/16', 
                        overflow: 'hidden', 
                        background: '#050505',
                        boxShadow: 'none',
                        borderRadius: 0,
                        border: 'none'
                    }}
                >
                    <div 
                        className="mobile-screen" 
                        id="mobile-screen" 
                        ref={screenRef}
                        style={{
                            width: 1080, height: 1920, backgroundColor: videoBgColor,
                            boxSizing: 'border-box', display: 'block',
                            position: 'absolute', top: '50%', left: '50%', transformOrigin: 'top left',
                            transform: `scale(${screenScale}) translate(-50%, -50%)`,
                            fontFamily: fontFamily,
                            letterSpacing: `${letterSpacing}px`,
                            textTransform: textTransform,
                            textAlign: textAlign
                        }}
                    >
                        <div 
                            className="caption-wrapper" 
                            style={{ 
                                position: 'absolute',
                                top: `${videoAlignPercent}%`,
                                transform: 'translateY(-50%)',
                                left: 0,
                                width: '100%', 
                                paddingLeft: 54, 
                                paddingRight: 157, 
                                boxSizing: 'border-box', 
                                fontSize: fontSize, 
                                lineHeight: 1.45 
                            }}
                        >
                            <div 
                                className="caption-scroll-container" 
                                id="scroll-container" 
                                ref={scrollContainerRef}
                                style={{
                                    width: '100%', height: '10.15em', overflow: 'hidden', position: 'relative',
                                    WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.25) 15%, rgba(0,0,0,1) 40%, rgba(0,0,0,1) 60%, rgba(0,0,0,0.25) 85%, rgba(0,0,0,0) 100%)',
                                    maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.25) 15%, rgba(0,0,0,1) 40%, rgba(0,0,0,1) 60%, rgba(0,0,0,0.25) 85%, rgba(0,0,0,0) 100%)'
                                }}
                                onWheel={(e) => {
                                    if (isPlaying) return;
                                    e.preventDefault();
                                    scrubToLine(e.deltaY > 0 ? 1 : -1);
                                }}
                            >
                                <div className="caption-track" id="caption-track" ref={trackRef} style={{ position: 'relative', transition: 'transform 0.6s cubic-bezier(0.25, 1, 0.3, 1)', willChange: 'transform', textAlign: textAlign }}>
                                    {renderedWords.map((word, wIdx) => {
                                        let active = false;
                                        if (visualLines[currentLineIndex]) {
                                            active = visualLines[currentLineIndex].some(span => span.el.dataset.segIndex == word.segIndex && parseInt(span.el.dataset.wordIdx) === wIdx);
                                        }

                                        // STRICT SELECTION FIX: Only active words are selectable when paused
                                        const isSelectable = active && !isPlaying;

                                        return (
                                            <React.Fragment key={wIdx}>
                                                {word.isExtraSpace ? (
                                                    <span 
                                                        className={`word ${active ? 'active-word' : ''}`}
                                                        data-seg-index={word.segIndex}
                                                        data-base-duration={word.baseDuration}
                                                        data-word-idx={wIdx}
                                                        style={{ 
                                                            display: 'inline', 
                                                            pointerEvents: isSelectable || armedComponentId ? 'auto' : 'none',
                                                            userSelect: isSelectable && !armedComponentId ? 'text' : 'none',
                                                            WebkitUserSelect: isSelectable && !armedComponentId ? 'text' : 'none',
                                                            cursor: armedComponentId ? 'crosshair' : 'auto'
                                                        }}
                                                    >
                                                        {(() => {
                                                            const spaceIsSelected = currentSelectionCharIds.includes(word.spaceId);
                                                            const spaceColor = charOverrides[word.spaceId] || (active ? lineSettings[currentLineIndex]?.color : undefined) || '#ffffff';
                                                            const spaceTextColor = spaceIsSelected && !selectionHasUniformOverride ? '#000' : (active ? spaceColor : '#3d3d3d');
                                                            const spaceBgColor = spaceIsSelected && !selectionHasUniformOverride ? '#fff' : (spaceIsSelected ? 'rgba(255, 255, 255, 0.16)' : 'transparent');
                                                            
                                                            return (
                                                                <span 
                                                                    className={`char space ${spaceIsSelected ? 'edit-active' : ''}`}
                                                                    data-char-id={word.spaceId}
                                                                    data-override-color={charOverrides[word.spaceId]}
                                                                    style={{
                                                                        display: 'inline', fontWeight: fontWeight, transition: 'color 0.1s ease, text-shadow 0.1s ease, background-color 0.1s ease',
                                                                        color: spaceTextColor,
                                                                        textShadow: active && !spaceIsSelected ? `0 0 1px ${spaceColor}` : '',
                                                                        backgroundColor: spaceBgColor,
                                                                        borderRadius: spaceIsSelected ? 2 : 0
                                                                    }}
                                                                >
{'\u00A0'}
                                                                </span>
                                                            );
                                                        })()}
                                                    </span>
                                                ) : word.isComponent ? (
                                                    <span 
                                                        className={`word ${active ? 'active-word' : ''} inline-comp-span`}
                                                        data-seg-index={word.segIndex}
                                                        data-base-duration={word.baseDuration}
                                                        data-word-idx={wIdx}
                                                        style={{ 
                                                            display: 'inline-block', 
                                                            pointerEvents: isSelectable ? 'auto' : 'none',
                                                            verticalAlign: 'middle',
                                                            margin: '-5px 0'
                                                        }}
                                                    >
                                                        {(() => {
                                                            const comp = customComponents.find(c => c.id === word.componentId);
                                                            if (!comp) return null;
                                                            return (
                                                                <span style={{ display: 'inline-block', transform: `translate(${comp.offsetX || 0}px, ${(comp.offsetY || 0) - 5}px)` }}>
                                                                    <img 
                                                                        src={comp.src} 
                                                                        alt="comp" 
                                                                        className={`inline-component ${active ? `anim-${comp.animation}` : ''}`}
                                                                        data-animation={comp.animation}
                                                                        style={{ 
                                                                            width: comp.size, height: comp.size, objectFit: 'contain',
                                                                            opacity: active ? 1 : 0,
                                                                            transform: active ? 'scale(1)' : 'scale(0.8)',
                                                                            transition: 'opacity 0.2s ease, transform 0.2s ease'
                                                                        }}
                                                                    />
                                                                </span>
                                                            );
                                                        })()}
                                                        {(() => {
                                                            const spaceIsSelected = currentSelectionCharIds.includes(word.spaceId);
                                                            const spaceColor = charOverrides[word.spaceId] || (active ? lineSettings[currentLineIndex]?.color : undefined) || '#ffffff';
                                                            const spaceTextColor = spaceIsSelected && !selectionHasUniformOverride ? '#000' : (active ? spaceColor : '#3d3d3d');
                                                            const spaceBgColor = spaceIsSelected && !selectionHasUniformOverride ? '#fff' : (spaceIsSelected ? 'rgba(255, 255, 255, 0.16)' : 'transparent');
                                                            
                                                            return (
                                                                <span 
                                                                    className={`char space ${spaceIsSelected ? 'edit-active' : ''}`}
                                                                    data-char-id={word.spaceId}
                                                                    data-override-color={charOverrides[word.spaceId]}
                                                                    style={{
                                                                        display: 'inline', fontWeight: fontWeight, transition: 'color 0.1s ease, text-shadow 0.1s ease, background-color 0.1s ease',
                                                                        color: spaceTextColor,
                                                                        textShadow: active && !spaceIsSelected ? `0 0 1px ${spaceColor}` : '',
                                                                        backgroundColor: spaceBgColor,
                                                                        borderRadius: spaceIsSelected ? 2 : 0
                                                                    }}
                                                                >
                                                                    {' '}
                                                                </span>
                                                            );
                                                        })()}
                                                    </span>
                                                ) : (
                                                    <span 
                                                        className={`word ${active ? 'active-word' : ''}`}
                                                        data-seg-index={word.segIndex}
                                                        data-base-duration={word.baseDuration}
                                                        data-word-idx={wIdx}
                                                        style={{ 
                                                            display: 'inline', 
                                                            pointerEvents: isSelectable || armedComponentId ? 'auto' : 'none',
                                                            userSelect: isSelectable && !armedComponentId ? 'text' : 'none',
                                                            WebkitUserSelect: isSelectable && !armedComponentId ? 'text' : 'none',
                                                            cursor: armedComponentId ? 'crosshair' : 'auto'
                                                        }}
                                                        onMouseUp={() => {
                                                            if (armedComponentId && active) {
                                                                const targetSegIndex = word.segIndex;
                                                                const wordsInSeg = renderedWords.filter(w => w.segIndex === targetSegIndex);
                                                                const localWordIdx = wordsInSeg.indexOf(word);
                                                                
                                                                const textBefore = wordsInSeg.slice(0, localWordIdx + 1).map(w => w.isComponent ? `[COMP:${w.componentId}]` : w.chars.map(c => c.char).join('')).join(' ');
                                                                const textAfter = wordsInSeg.slice(localWordIdx + 1).map(w => w.isComponent ? `[COMP:${w.componentId}]` : w.chars.map(c => c.char).join('')).join(' ');
                                                                
                                                                const newText = textBefore + ` [COMP:${armedComponentId}]  ` + textAfter;
                                                                
                                                                const newSegments = [...segments];
                                                                newSegments[targetSegIndex] = { ...newSegments[targetSegIndex], text: newText.trim() };
                                                                setSegments(newSegments);
                                                                setArmedComponentId(null);
                                                                
                                                                window.getSelection().removeAllRanges();
                                                                setCurrentSelectionCharIds([]);
                                                            }
                                                        }}
                                                    >
                                                    {word.chars.map(c => {
                                                        const color = charOverrides[c.id] || (active ? lineSettings[currentLineIndex]?.color : undefined) || '#ffffff';
                                                        const isSelected = currentSelectionCharIds.includes(c.id);
                                                        const textColor = isSelected && !selectionHasUniformOverride ? '#000' : (active ? color : '#3d3d3d');
                                                        const bgColor = isSelected && !selectionHasUniformOverride ? '#fff' : (isSelected ? 'rgba(255, 255, 255, 0.16)' : 'transparent');
                                                        
                                                        return (
                                                            <span 
                                                                key={c.id} 
                                                                className={`char ${isSelected ? 'edit-active' : ''}`}
                                                                data-char-id={c.id}
                                                                data-override-color={charOverrides[c.id]}
                                                                style={{
                                                                    display: 'inline',
                                                                    fontWeight: fontWeight,
                                                                    transition: 'color 0.1s ease, text-shadow 0.1s ease, background-color 0.1s ease',
                                                                    color: textColor,
                                                                    textShadow: active && !isSelected ? `0 0 1px ${color}` : '',
                                                                    backgroundColor: bgColor,
                                                                    borderRadius: isSelected ? 2 : 0
                                                                }}
                                                            >
                                                                {c.char}
                                                            </span>
                                                        );
                                                    })}
                                                    {(() => {
                                                        const spaceIsSelected = currentSelectionCharIds.includes(word.spaceId);
                                                        const spaceColor = charOverrides[word.spaceId] || (active ? lineSettings[currentLineIndex]?.color : undefined) || '#ffffff';
                                                        const spaceTextColor = spaceIsSelected && !selectionHasUniformOverride ? '#000' : (active ? spaceColor : '#3d3d3d');
                                                        const spaceBgColor = spaceIsSelected && !selectionHasUniformOverride ? '#fff' : (spaceIsSelected ? 'rgba(255, 255, 255, 0.16)' : 'transparent');
                                                        
                                                        return (
                                                            <span 
                                                                className={`char space ${spaceIsSelected ? 'edit-active' : ''}`}
                                                                data-char-id={word.spaceId}
                                                                data-override-color={charOverrides[word.spaceId]}
                                                                style={{
                                                                    display: 'inline', fontWeight: fontWeight, transition: 'color 0.1s ease, text-shadow 0.1s ease, background-color 0.1s ease',
                                                                    color: spaceTextColor,
                                                                    textShadow: active && !spaceIsSelected ? `0 0 1px ${spaceColor}` : '',
                                                                    backgroundColor: spaceBgColor,
                                                                    borderRadius: spaceIsSelected ? 2 : 0
                                                                }}
                                                            >
                                                                {' '}
                                                            </span>
                                                        );
                                                    })()}
                                                </span>
                                                )}
                                                {(word.isLastInSeg || word.hasNewlineAfter) && wIdx !== renderedWords.length - 1 && <div style={{ flexBasis: '100%', height: 0 }}></div>}
                                            </React.Fragment>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Docked Controller (Hidden automatically by browser in true fullscreen) */}
            <div 
                className="preview-controls" 
                style={{ 
                    width: '100%', 
                    height: 48, 
                    background: '#0a0a0a', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between', 
                    padding: '0 16px',
                    boxSizing: 'border-box', 
                    borderTop: '1px solid #1a1a1a',
                    zIndex: 10
                }}
            >
                <div style={{ fontSize: 12, color: '#a0a0a0', fontFamily: 'monospace', display: 'flex', gap: 4, minWidth: 100 }}>
                    <span style={{ color: '#ffffff' }}>{currentTimeDisplay}</span>
                    <span style={{ color: '#444' }}>|</span>
                    <span>{totalTimeDisplay}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <button tabIndex="-1" onMouseDown={e => e.preventDefault()} onClick={skipPrevLine} style={{ background: 'none', outline: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 4, display: 'flex' }} title="Previous Line">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
                        </svg>
                    </button>

                    <button tabIndex="-1" onMouseDown={e => e.preventDefault()} onClick={togglePlayback} style={{ background: 'none', outline: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 4, display: 'flex' }} title={isPlaying ? "Pause" : "Play"}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                            {isPlaying ? <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /> : <path d="M8 5v14l11-7z" />}
                        </svg>
                    </button>

                    <button tabIndex="-1" onMouseDown={e => e.preventDefault()} onClick={skipNextLine} style={{ background: 'none', outline: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 4, display: 'flex' }} title="Next Line">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M14.5 12L6 6v12zm3.5-6h2v12h-2z"/>
                        </svg>
                    </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 100, justifyContent: 'flex-end' }}>
                    <button 
                        tabIndex="-1" onMouseDown={e => e.preventDefault()}
                        onClick={() => setIsLooping(!isLooping)} 
                        style={{ background: 'none', outline: 'none', border: 'none', color: isLooping ? 'var(--accent)' : '#666', cursor: 'pointer', padding: 4, display: 'flex', transition: 'color 0.2s' }}
                        title="Toggle Loop Sequence"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>
                        </svg>
                    </button>

                    <button 
                        tabIndex="-1" onMouseDown={e => e.preventDefault()}
                        onClick={toggleFullscreen} 
                        style={{ background: 'none', outline: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 4, display: 'flex' }}
                        title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                            {isFullscreen ? (
                                <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
                            ) : (
                                <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                            )}
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
};
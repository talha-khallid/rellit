import React, { useContext, useEffect, useRef, useLayoutEffect, useState } from 'react';
import { EditorContext } from '../../context/EditorContext';

export const Preview = ({ setScrollBox, setCharsData }) => {
    const { 
        segments, visualLines, setVisualLines, 
        lineSettings, updateLineSettings,
        isPlaying, togglePlayback,
        currentLineIndex, setCurrentLineIndex,
        currentSelectionCharIds, setCurrentSelectionCharIds,
        globalAudioObj, setGlobalAudioObj,
        currentlyPlayingSegIdx, setCurrentlyPlayingSegIdx,
        charOverrides,
        currentLineStartSysTimeRef, currentLineStartTimeSecondsRef
    } = useContext(EditorContext);

    const trackRef = useRef(null);
    const scrollContainerRef = useRef(null);
    const screenRef = useRef(null);
    const [screenScale, setScreenScale] = useState(1);
    
    const lineTimerRef = useRef(null);
    const [renderedWords, setRenderedWords] = useState([]);

    // 1. Convert segments into rendered words map
    useEffect(() => {
        const words = [];
        let globalCharIndex = 0;
        
        segments.forEach((seg, segIndex) => {
            const segWords = seg.text.split(' ');
            const timePerWord = parseFloat(seg.duration) / segWords.length;
            
            segWords.forEach((word, wordIndex) => {
                if (word.trim() === '') return;
                
                const chars = word.split('').map(char => ({
                    char,
                    id: globalCharIndex++
                }));
                
                words.push({
                    chars,
                    spaceId: globalCharIndex++,
                    baseDuration: timePerWord,
                    segIndex,
                    isLastInSeg: wordIndex === segWords.length - 1
                });
            });
        });
        
        setRenderedWords(words);
    }, [segments]);

    // 2. Calculate visual lines once words are rendered
    useLayoutEffect(() => {
        if (!trackRef.current || renderedWords.length === 0) return;
        
        const calculateVisualLines = () => {
            if (!trackRef.current) return;
            const wordSpans = trackRef.current.querySelectorAll('.word');
            const newVisualLines = [];
            let currentLine = [];
            let currentOffsetTop = -1;
            
            wordSpans.forEach(span => {
                const offsetTop = span.offsetTop;
                if (currentOffsetTop === -1 || Math.abs(offsetTop - currentOffsetTop) > 5) {
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
    }, [renderedWords, setVisualLines]);

    // 3. Highlight line translation logic
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

    // 4. Update screen scale on resize
    useLayoutEffect(() => {
        const updateScreenScale = () => {
            const container = document.querySelector('.mobile-screen-container');
            if(container) {
                const scale = container.clientHeight / 1920;
                setScreenScale(scale);
            }
        };
        updateScreenScale();
        window.addEventListener('resize', updateScreenScale);
        return () => window.removeEventListener('resize', updateScreenScale);
    }, []);

    // 5. Playback Loop
    const playLoop = () => {
        if (!isPlaying || visualLines.length === 0) return;
        
        let targetLineIdx = currentLineIndex;
        if (targetLineIdx >= visualLines.length) targetLineIdx = 0;
        
        let startSecs = 0;
        for(let i = 0; i < targetLineIdx; i++) {
            startSecs += parseFloat(lineSettings[i]?.duration || 0.1);
        }
        currentLineStartTimeSecondsRef.current = startSecs;
        currentLineStartSysTimeRef.current = performance.now();

        const currentSegIdx = visualLines[targetLineIdx][0].segIndex;
        
        if (currentSegIdx !== currentlyPlayingSegIdx) {
            setCurrentlyPlayingSegIdx(currentSegIdx);
            const seg = segments[currentSegIdx];
            
            if (globalAudioObj) {
                globalAudioObj.pause();
                setGlobalAudioObj(null);
            }
            if (seg.audioBuffer) {
                const blob = new Blob([seg.audioBuffer]);
                const url = URL.createObjectURL(blob);
                const audio = new Audio(url);
                
                let offsetTime = 0;
                for(let i=0; i<targetLineIdx; i++) {
                    if (visualLines[i][0].segIndex === currentSegIdx) {
                        offsetTime += parseFloat(lineSettings[i]?.duration || 0.1);
                    }
                }
                
                audio.currentTime = offsetTime;
                audio.play();
                setGlobalAudioObj(audio);
            }
        }

        setCurrentSelectionCharIds([]); 
        
        let durationMs = parseFloat(lineSettings[targetLineIdx]?.duration || 0.1) * 1000;
        lineTimerRef.current = setTimeout(() => {
            setCurrentLineIndex(prev => prev + 1);
        }, durationMs);
    };

    useEffect(() => {
        if (isPlaying) {
            playLoop();
        } else {
            if (lineTimerRef.current) clearTimeout(lineTimerRef.current);
            if (globalAudioObj) globalAudioObj.pause();
        }
        // eslint-disable-next-line
    }, [isPlaying, currentLineIndex]);

    // 6. Scrubbing
    const scrubToLine = (offset) => {
        setCurrentLineIndex(prev => {
            let newIndex = prev + offset;
            if (newIndex < 0) newIndex = 0;
            if (newIndex >= visualLines.length) newIndex = visualLines.length - 1;
            return newIndex;
        });
        setCurrentSelectionCharIds([]);
    };

    // 7. CRITICAL MATRICES UPDATE PIPELINE EXPORTER
    // Hooks into Context engine updates to compile 1080x1920 layout matrices dynamically
    const captureExportGeometry = () => {
        if (!screenRef.current || !scrollContainerRef.current || !trackRef.current || visualLines.length === 0) return;

        const screenEl = screenRef.current;
        const originalParent = screenEl.parentNode;
        const originalNextSibling = screenEl.nextSibling;
        const originalCssText = screenEl.style.cssText;
        
        const wrapperEl = screenEl.querySelector('.caption-wrapper');
        const originalWrapperCss = wrapperEl ? wrapperEl.style.cssText : '';
        const trackEl = trackRef.current;

        // Temporarily append to root context to safely clear CSS scale calculations
        document.body.appendChild(screenEl);

        screenEl.style.cssText = 'width: 1080px !important; height: 1920px !important; max-width: none !important; position: absolute !important; top: 0 !important; left: 0 !important; z-index: -1000 !important; transform: scale(1) !important; display: flex !important; alignItems: center !important; background-color: #050505 !important; border-radius: 0 !important;';
        if (wrapperEl) {
            wrapperEl.style.cssText = 'width: 100% !important; padding-left: 54px !important; padding-right: 157px !important; box-sizing: border-box !important; font-size: 43.5px !important; line-height: 1.45 !important;';
        }
        
        const originalTrackTransform = trackEl.style.transform;
        trackEl.style.transform = 'translateY(0px)';

        // Force browser layout redraw
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

        setCharsData(charsData);

        // Put things right back in the workflow
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
    }, [visualLines, charOverrides, lineSettings, screenScale]);

    // Selection Handling
    useEffect(() => {
        const handleSelection = () => {
            if (isPlaying) return;
            const selection = window.getSelection();
            if (!selection.rangeCount || !trackRef.current?.contains(selection.anchorNode)) return;

            if (selection.isCollapsed) {
                if (currentSelectionCharIds.length > 0) setCurrentSelectionCharIds([]);
                return;
            }

            const charSpans = trackRef.current.querySelectorAll('.char');
            const selectedIds = [];
            charSpans.forEach(span => {
                if (selection.containsNode(span, true)) {
                    selectedIds.push(parseInt(span.dataset.charId));
                }
            });

            if (selectedIds.length > 0 && selectedIds.join(',') !== currentSelectionCharIds.join(',')) {
                setCurrentSelectionCharIds(selectedIds);
            }
        };

        document.addEventListener('selectionchange', handleSelection);
        return () => document.removeEventListener('selectionchange', handleSelection);
    }, [isPlaying, currentSelectionCharIds, setCurrentSelectionCharIds]);

    return (
        <div className="center-preview" onMouseDown={(e) => {
            if (!e.target.closest('.word') && !isPlaying) {
                window.getSelection().removeAllRanges();
                setCurrentSelectionCharIds([]);
            }
        }}>
            <div className="preview-wrapper" style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, paddingBottom: 10, boxSizing: 'border-box' }}>
                <div className="mobile-screen-container" style={{ position: 'relative', flex: 1, height: 'auto', aspectRatio: '9/16', maxHeight: 'calc(100% - 70px)', overflow: 'hidden', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)', boxShadow: '0 20px 50px rgba(0,0,0,0.8)' }}>
                    <div 
                        className="mobile-screen" 
                        id="mobile-screen" 
                        ref={screenRef}
                        style={{
                            width: 1080, height: 1920, backgroundColor: '#050505',
                            boxSizing: 'border-box', display: 'flex', alignItems: 'center',
                            position: 'absolute', top: 0, left: 0, transformOrigin: 'top left',
                            transform: `scale(${screenScale})`
                        }}
                    >
                        <div className="caption-wrapper" style={{ width: '100%', paddingLeft: 54, paddingRight: 157, boxSizing: 'border-box', fontSize: 43.5, lineHeight: 1.45 }}>
                            <div 
                                className="caption-scroll-container" 
                                id="scroll-container" 
                                ref={scrollContainerRef}
                                onWheel={(e) => {
                                    if (isPlaying) return;
                                    e.preventDefault();
                                    scrubToLine(e.deltaY > 0 ? 1 : -1);
                                }}
                                style={{
                                    width: '100%', height: '10.15em', overflow: 'hidden', position: 'relative',
                                    WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.25) 15%, rgba(0,0,0,1) 40%, rgba(0,0,0,1) 60%, rgba(0,0,0,0.25) 85%, rgba(0,0,0,0) 100%)',
                                    maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.25) 15%, rgba(0,0,0,1) 40%, rgba(0,0,0,1) 60%, rgba(0,0,0,0.25) 85%, rgba(0,0,0,0) 100%)'
                                }}
                            >
                                <div className="caption-track" id="caption-track" ref={trackRef} style={{ position: 'relative', transition: 'transform 0.6s cubic-bezier(0.25, 1, 0.3, 1)', willChange: 'transform', textAlign: 'left' }}>
                                    {renderedWords.map((word, wIdx) => {
                                        let active = false;
                                        if (visualLines[currentLineIndex]) {
                                            active = visualLines[currentLineIndex].some(span => span.el.dataset.segIndex == word.segIndex && parseInt(span.el.dataset.wordIdx) === wIdx);
                                        }

                                        return (
                                            <React.Fragment key={wIdx}>
                                                <span 
                                                    className={`word ${active ? 'active-word' : ''}`}
                                                    data-seg-index={word.segIndex}
                                                    data-base-duration={word.baseDuration}
                                                    data-word-idx={wIdx}
                                                    style={{ 
                                                        display: 'inline', 
                                                        pointerEvents: isPlaying ? 'none' : 'auto',
                                                        userSelect: isPlaying ? 'none' : 'text'
                                                    }}
                                                >
                                                    {word.chars.map(c => {
                                                        const color = charOverrides[c.id] || (active ? lineSettings[currentLineIndex]?.color : undefined) || '#ffffff';
                                                        const isSelected = currentSelectionCharIds.includes(c.id);
                                                        return (
                                                            <span 
                                                                key={c.id} 
                                                                className={`char ${isSelected ? 'edit-active' : ''}`}
                                                                data-char-id={c.id}
                                                                data-override-color={charOverrides[c.id]}
                                                                style={{
                                                                    display: 'inline',
                                                                    fontWeight: 500,
                                                                    transition: 'color 0.1s ease, text-shadow 0.1s ease',
                                                                    color: active ? color : '#a6a6a6',
                                                                    textShadow: active ? `0 0 1px ${color}` : '',
                                                                    backgroundColor: isSelected ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
                                                                    borderRadius: isSelected ? 2 : 0
                                                                }}
                                                            >
                                                                {c.char}
                                                            </span>
                                                        );
                                                    })}
                                                    <span 
                                                        className={`char space ${currentSelectionCharIds.includes(word.spaceId) ? 'edit-active' : ''}`}
                                                        data-char-id={word.spaceId}
                                                        data-override-color={charOverrides[word.spaceId]}
                                                        style={{
                                                            display: 'inline', fontWeight: 500, transition: 'color 0.1s ease, text-shadow 0.1s ease',
                                                            color: active ? (charOverrides[word.spaceId] || lineSettings[currentLineIndex]?.color || '#ffffff') : '#a6a6a6',
                                                            textShadow: active ? `0 0 1px ${charOverrides[word.spaceId] || lineSettings[currentLineIndex]?.color || '#ffffff'}` : '',
                                                            backgroundColor: currentSelectionCharIds.includes(word.spaceId) ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
                                                            borderRadius: currentSelectionCharIds.includes(word.spaceId) ? 2 : 0
                                                        }}
                                                    >
                                                        {' '}
                                                    </span>
                                                </span>
                                                {word.isLastInSeg && wIdx !== renderedWords.length - 1 && <div style={{ flexBasis: '100%', height: 0 }}></div>}
                                            </React.Fragment>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <button 
                    className="capcut-play-btn" 
                    id="play-pause-btn" 
                    onClick={togglePlayback}
                >
                    <svg viewBox="0 0 24 24">
                        {isPlaying ? <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /> : <path d="M8 5v14l11-7z" />}
                    </svg>
                </button>
            </div>
        </div>
    );
};
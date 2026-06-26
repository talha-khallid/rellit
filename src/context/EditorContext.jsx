import React, { createContext, useState, useEffect, useCallback, useRef } from 'react';

export const EditorContext = createContext();

const initialSegments = [
    {
        text: "Dynamic text highlighting creates a reading rhythm that matches the user's natural reading pace, reducing cognitive load and helping them to maintain focus and flow.",
        duration: 8.0,
        audioBuffer: null,
        audioDuration: null
    },
    {
        text: "Standard interfaces often present overwhelming walls of text, but guiding the eye ensures the viewer never loses their place.",
        duration: 6.0,
        audioBuffer: null,
        audioDuration: null
    },
    {
        text: "By timing each segment precisely, we create a distraction-free experience optimized for mobile screens.",
        duration: 5.0,
        audioBuffer: null,
        audioDuration: null
    }
];

export class AudioBufferPlayer {
    constructor(audioCtx, audioBuffer) {
        this.audioCtx = audioCtx;
        this.audioBuffer = audioBuffer;
        this.source = null;
    }
    play(offset = 0) {
        if (this.source) {
            try { this.source.stop(); } catch(e) {}
        }
        this.source = this.audioCtx.createBufferSource();
        this.source.buffer = this.audioBuffer;
        this.source.connect(this.audioCtx.destination);
        const duration = this.audioBuffer.duration;
        const safeOffset = Math.min(Math.max(0, offset), duration);
        this.source.start(0, safeOffset);
    }
    pause() {
        if (this.source) {
            try { this.source.stop(); } catch(e) {}
            this.source = null;
        }
    }
    stop() {
        this.pause();
    }
}

export const EditorProvider = ({ children }) => {
    const audioCtxRef = useRef(null);
    const getAudioCtx = useCallback(() => {
        if (!audioCtxRef.current) {
            audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtxRef.current.state === 'suspended') {
            audioCtxRef.current.resume();
        }
        return audioCtxRef.current;
    }, []);
    const [segments, setSegments] = useState([]);
    const [visualLines, setVisualLines] = useState([]);
    const [lineSettings, setLineSettings] = useState({});
    const [charOverrides, setCharOverrides] = useState({});
    
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentLineIndex, setCurrentLineIndex] = useState(0);
    const [currentSelectionCharIds, setCurrentSelectionCharIds] = useState([]);
    const [globalAudioObj, setGlobalAudioObj] = useState(null);
    const [currentlyPlayingSegIdx, setCurrentlyPlayingSegIdx] = useState(-1);

    const currentLineStartSysTimeRef = useRef(0);
    const currentLineStartTimeSecondsRef = useRef(0);

    // Timeline scale
    const [timelineScale, setTimelineScale] = useState(70);

    // Sync from localStorage or default
    useEffect(() => {
        fetch('/captions.json')
            .then(res => res.ok ? res.json() : initialSegments)
            .then(data => setSegments(data))
            .catch(() => setSegments(initialSegments));
    }, []);

    // Helper: Enforce Audio constraints
    const enforceSegmentAudioConstraints = useCallback((newVisualLines, newLineSettings, currentSegments) => {
        const segLines = {};
        newVisualLines.forEach((line, lineIdx) => {
            const segIdx = line[0].segIndex;
            if (!segLines[segIdx]) segLines[segIdx] = [];
            segLines[segIdx].push(lineIdx);
        });

        for (let segIdxStr in segLines) {
            const segIdx = parseInt(segIdxStr);
            const seg = currentSegments[segIdx];
            if (seg && seg.audioDuration !== null && seg.audioDuration !== undefined) {
                const lines = segLines[segIdx];
                let currentTotal = 0;
                const durs = lines.map(lineIdx => {
                    const d = parseFloat(newLineSettings[lineIdx].duration);
                    currentTotal += d;
                    return d;
                });
                
                if (currentTotal <= 0) {
                    lines.forEach(lineIdx => { 
                        newLineSettings[lineIdx].duration = (seg.audioDuration / lines.length).toFixed(2); 
                    });
                    continue;
                }

                let newTotal = 0;
                lines.forEach((lineIdx, i) => {
                    let newDur = (durs[i] / currentTotal) * seg.audioDuration;
                    newDur = Math.round(newDur * 100) / 100;
                    if (newDur < 0.1) newDur = 0.1;
                    newLineSettings[lineIdx].duration = newDur.toFixed(2);
                    newTotal += parseFloat(newLineSettings[lineIdx].duration);
                });

                const diff = seg.audioDuration - newTotal;
                if (Math.abs(diff) > 0.001) {
                    let lastIdx = lines[lines.length - 1];
                    let lastDur = parseFloat(newLineSettings[lastIdx].duration);
                    let corrected = lastDur + diff;
                    if (corrected < 0.1) corrected = 0.1;
                    newLineSettings[lastIdx].duration = corrected.toFixed(2);
                }
            }
        }
        return newLineSettings;
    }, []);

    const updateLineSettings = useCallback((newVisualLines, currentSettings, currentSegments) => {
        let settings = { ...currentSettings };
        newVisualLines.forEach((line, index) => {
            if (!settings[index]) {
                let baseDur = 0;
                line.forEach(span => baseDur += parseFloat(span.baseDuration));
                settings[index] = { color: '#ffffff', duration: baseDur.toFixed(2) };
            }
        });
        Object.keys(settings).forEach(key => {
            if (parseInt(key) >= newVisualLines.length) delete settings[key];
        });
        
        settings = enforceSegmentAudioConstraints(newVisualLines, settings, currentSegments);
        setLineSettings(settings);
    }, [enforceSegmentAudioConstraints]);

    const calculateLines = useCallback(() => {
        // We will do this slightly differently in React.
        // Instead of calculating lines by offsetTop directly in Context,
        // we'll rely on a layout effect inside the Preview component
        // which will then report visualLines back here.
    }, []);

    const togglePlayback = useCallback(() => {
        setIsPlaying(prev => !prev);
    }, []);

    const stopAudio = useCallback(() => {
        if (globalAudioObj) {
            globalAudioObj.pause();
            setGlobalAudioObj(null);
        }
        setCurrentlyPlayingSegIdx(-1);
    }, [globalAudioObj]);

    useEffect(() => {
        if (!isPlaying) stopAudio();
    }, [isPlaying, stopAudio]);

    const value = {
        segments, setSegments,
        visualLines, setVisualLines,
        lineSettings, setLineSettings,
        charOverrides, setCharOverrides,
        isPlaying, setIsPlaying, togglePlayback,
        currentLineIndex, setCurrentLineIndex,
        currentSelectionCharIds, setCurrentSelectionCharIds,
        globalAudioObj, setGlobalAudioObj,
        currentlyPlayingSegIdx, setCurrentlyPlayingSegIdx,
        timelineScale, setTimelineScale,
        updateLineSettings, stopAudio,
        enforceSegmentAudioConstraints,
        currentLineStartSysTimeRef, currentLineStartTimeSecondsRef,
        getAudioCtx, AudioBufferPlayer
    };

    return (
        <EditorContext.Provider value={value}>
            {children}
        </EditorContext.Provider>
    );
};

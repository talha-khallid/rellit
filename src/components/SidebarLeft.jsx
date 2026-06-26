import React, { useContext, useState, useRef, useEffect } from 'react';
import { EditorContext } from '../context/EditorContext';

// --- Dynamic Waveform Component ---
const Waveform = ({ audioBuffer }) => {
    const [peaks, setPeaks] = useState([]);

    useEffect(() => {
        if (!audioBuffer) return;
        
        try {
            const channelData = audioBuffer.getChannelData(0);
            const numPeaks = 50; 
            const step = Math.ceil(channelData.length / numPeaks);
            const newPeaks = [];
            let max = 0;

            for (let i = 0; i < numPeaks; i++) {
                let sum = 0;
                for (let j = 0; j < step; j++) {
                    const val = channelData[i * step + j];
                    if (val) sum += val * val;
                }
                const rms = Math.sqrt(sum / step);
                if (rms > max) max = rms;
                newPeaks.push(rms);
            }

            // Normalize heights to percentage
            const normalized = newPeaks.map(p => (max > 0 ? (p / max) * 100 : 5));
            setPeaks(normalized);
        } catch (e) {
            console.error("Waveform generation failed:", e);
        }
    }, [audioBuffer]);

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', height: '24px', flex: 1, overflow: 'hidden' }}>
            {peaks.map((p, i) => (
                <div 
                    key={i} 
                    style={{ 
                        width: '2px', 
                        height: `${Math.max(15, p)}%`, 
                        backgroundColor: '#888', 
                        borderRadius: '2px',
                        transition: 'height 0.2s ease'
                    }}
                ></div>
            ))}
        </div>
    );
};

export const SidebarLeft = () => {
    const { 
        segments, setSegments, 
        visualLines, 
        isPlaying, togglePlayback,
        setCurrentLineIndex
    } = useContext(EditorContext);

    const [newText, setNewText] = useState('');
    const [newDuration, setNewDuration] = useState('05');
    const [newAudioFile, setNewAudioFile] = useState(null);
    const [newAudioBuffer, setNewAudioBuffer] = useState(null);
    
    const fileInputRef = useRef(null);

    // Format duration string to clean '05' or '10.5' string
    const formatDurationString = (val) => {
        let num = parseFloat(val);
        if (isNaN(num)) return '';
        if (num < 10 && Number.isInteger(num)) return `0${num}`;
        return num.toString();
    };

    // Handle Main Form Audio Upload
    const handleMainAudioChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        setNewAudioFile(file);
        
        const url = URL.createObjectURL(file);
        const tempAudio = new Audio(url);
        
        await new Promise(r => {
            tempAudio.onloadedmetadata = () => {
                setNewDuration(formatDurationString(tempAudio.duration));
                r();
            };
        });

        const arrayBuffer = await file.arrayBuffer();
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const decoded = await audioCtx.decodeAudioData(arrayBuffer);
        setNewAudioBuffer(decoded);
    };

    // Handle Inline Segment Audio Upload
    const handleSegmentAudioChange = async (index, e) => {
        const file = e.target.files[0];
        if (!file) return;

        const url = URL.createObjectURL(file);
        const tempAudio = new Audio(url);
        
        await new Promise(r => {
            tempAudio.onloadedmetadata = () => r();
        });

        const arrayBuffer = await file.arrayBuffer();
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const decoded = await audioCtx.decodeAudioData(arrayBuffer);

        const updated = [...segments];
        updated[index].audioBuffer = decoded;
        updated[index].audioDuration = tempAudio.duration;
        updated[index].duration = tempAudio.duration;
        setSegments(updated);
    };

    const handleAddSegment = () => {
        if (!newText.trim()) return;
        
        let segDuration = parseFloat(newDuration) || 5.0;

        setSegments([...segments, {
            text: newText,
            duration: segDuration,
            audioBuffer: newAudioBuffer,
            audioDuration: newAudioBuffer ? segDuration : null
        }]);

        // Reset Form
        setNewText('');
        setNewAudioFile(null);
        setNewAudioBuffer(null);
        setNewDuration('05');
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleRemoveSegment = (index) => {
        if (isPlaying) togglePlayback(); // Stop playback to prevent async crashes
        const newSegments = [...segments];
        newSegments.splice(index, 1);
        setSegments(newSegments);
        setCurrentLineIndex(0); // Reset safely to 0
    };

    const editSegment = (index) => {
        if (isPlaying) togglePlayback();
        const targetLineIdx = visualLines.findIndex(line => parseInt(line[0].segIndex) === index);
        if (targetLineIdx !== -1) {
            setCurrentLineIndex(targetLineIdx);
        }
    };

    return (
        <div className="sidebar">
            
            {/* Input Form Area */}
            <div>
                <textarea 
                    className="premium-textarea"
                    placeholder="Enter text......" 
                    value={newText}
                    onChange={e => setNewText(e.target.value)}
                ></textarea>
                
                <div className="upload-row">
                    <div className="upload-btn" onClick={() => fileInputRef.current?.click()}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>
                            {newAudioFile ? newAudioFile.name : 'Upload Audio'}
                        </span>
                        <span style={{ fontSize: 16, color: '#888' }}>↑</span>
                        <input 
                            type="file" 
                            accept="audio/*" 
                            ref={fileInputRef}
                            style={{ display: 'none' }}
                            onChange={handleMainAudioChange}
                        />
                    </div>
                    <input 
                        type="text" 
                        className="duration-input"
                        value={newDuration.includes('s') ? newDuration : newDuration + 's'}
                        onChange={e => setNewDuration(e.target.value.replace('s', ''))}
                        disabled={!!newAudioFile} // Lock if audio is uploaded
                    />
                </div>
                
                <button className="btn-primary" onClick={handleAddSegment}>
                    Add Segment
                </button>
            </div>

            {/* Segments List Area */}
            <div id="segments-list">
                {segments.map((seg, i) => {
                    const uniqueInputId = `audio-upload-${i}`;
                    return (
                        <div key={i} className="segment-card">
                            <div className="segment-box">
                                {seg.text}
                            </div>
                            
                            <div className="audio-box">
                                {seg.audioBuffer ? (
                                    <Waveform audioBuffer={seg.audioBuffer} />
                                ) : (
                                    <div 
                                        style={{ color: '#888', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}
                                        onClick={() => document.getElementById(uniqueInputId).click()}
                                    >
                                        Upload Audio <span style={{ fontSize: 14 }}>↑</span>
                                        <input 
                                            id={uniqueInputId}
                                            type="file" 
                                            accept="audio/*" 
                                            style={{ display: 'none' }}
                                            onChange={(e) => handleSegmentAudioChange(i, e)}
                                        />
                                    </div>
                                )}
                                <span style={{ fontSize: '13px', color: '#e0e0e0', marginLeft: '16px' }}>
                                    {Math.round(seg.duration)}s
                                </span>
                            </div>

                            <div className="actions-row">
                                <button className="btn-action" onClick={() => editSegment(i)}>Edit</button>
                                <button className="btn-action" onClick={() => handleRemoveSegment(i)}>Delete</button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
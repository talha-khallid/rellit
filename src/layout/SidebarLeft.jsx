import React, { useContext, useState, useRef, useEffect } from 'react';
import { EditorContext } from '../context/EditorContext';
import { CustomColorPicker } from '../components/CustomColorPicker';
import { ComponentCreator } from '../components/ComponentCreator';

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
        setCurrentLineIndex,
        setCurrentlyPlayingSegIdx,
        videoBgColor, setVideoBgColor,
        videoAlignPercent, setVideoAlignPercent,
        fontFamily, setFontFamily,
        fontWeight, setFontWeight,
        textTransform, setTextTransform,
        fontSize, setFontSize,
        textAlign, setTextAlign,
        letterSpacing, setLetterSpacing,
        activeTab
    } = useContext(EditorContext);

    const renderTypographySettings = () => (
        <div className="typography-settings" style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
            <span className="panel-eyebrow" style={{ marginBottom: 16 }}>Typography</span>
            
            <div className="prop-group" style={{ marginBottom: 16 }}>
                <label>Font Family</label>
                <select className="panel-select" value={fontFamily} onChange={(e) => setFontFamily(e.target.value)}>
                    <option value="Inter, sans-serif">Inter</option>
                    <option value="Arial, sans-serif">Arial</option>
                    <option value="'Courier New', Courier, monospace">Courier New</option>
                    <option value="'Times New Roman', Times, serif">Times New Roman</option>
                    <option value="Impact, fantasy">Impact</option>
                    <option value="'Comic Sans MS', cursive">Comic Sans</option>
                </select>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                <div className="prop-group" style={{ flex: 1 }}>
                    <label>Weight</label>
                    <select className="panel-select" value={fontWeight} onChange={(e) => setFontWeight(parseInt(e.target.value))}>
                        <option value={400}>Regular</option>
                        <option value={500}>Medium</option>
                        <option value={700}>Bold</option>
                        <option value={900}>Black</option>
                    </select>
                </div>
                <div className="prop-group" style={{ flex: 1 }}>
                    <label>Size</label>
                    <input className="panel-input" type="number" value={fontSize} onChange={(e) => setFontSize(parseFloat(e.target.value) || 10)} />
                </div>
            </div>

            <div className="prop-group" style={{ marginBottom: 16 }}>
                <label>Transform</label>
                <select className="panel-select" value={textTransform} onChange={(e) => setTextTransform(e.target.value)}>
                    <option value="none">Normal</option>
                    <option value="uppercase">UPPERCASE</option>
                    <option value="lowercase">lowercase</option>
                    <option value="capitalize">Capitalize</option>
                </select>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
                <div className="prop-group" style={{ flex: 1 }}>
                    <label>Align</label>
                    <select className="panel-select" value={textAlign} onChange={(e) => setTextAlign(e.target.value)}>
                        <option value="left">Left</option>
                        <option value="center">Center</option>
                        <option value="right">Right</option>
                    </select>
                </div>
                <div className="prop-group" style={{ flex: 1 }}>
                    <label>Spacing</label>
                    <input className="panel-input" type="number" step="0.5" value={letterSpacing} onChange={(e) => setLetterSpacing(parseFloat(e.target.value) || 0)} />
                </div>
            </div>
        </div>
    );

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
        setCurrentlyPlayingSegIdx(-1);
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
        <div className="sidebar" style={{ display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {activeTab === 'media' ? (
                    <>
                        <div className="panel-header">
                            <span className="panel-eyebrow">Script</span>
                            <h3 className="panel-title">Segments</h3>
                            <p className="panel-subtitle">Each segment is a block of text, optionally synced to its own voiceover clip.</p>
                        </div>

                        {/* Input Form Area */}
                        <div>
                            <textarea
                                className="premium-textarea"
                                placeholder="Write your next segment..."
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
                                    disabled={!!newAudioFile}
                                    style={{maxWidth: '50px'}}
                                />
                            </div>
                            
                            <button className="btn-primary" onClick={handleAddSegment}>
                                Add Segment
                            </button>
                        </div>

                        {/* Segments List Area */}
                        <div id="segments-list">
                            {segments.length === 0 && (
                                <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0', lineHeight: 1.6 }}>
                                    No segments yet.<br />Write some text above to get started.
                                </p>
                            )}
                            {segments.map((seg, i) => {
                                const uniqueInputId = `audio-upload-${i}`;
                                return (
                                    <div key={i} className="segment-card">
                                        <div className="segment-card-top">
                                            <span className="segment-num">Segment {i + 1}</span>
                                            <div className="segment-actions">
                                                <button className="icon-btn" title="Edit in inspector" onClick={() => editSegment(i)}>
                                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                                        <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                                    </svg>
                                                </button>
                                                <button className="icon-btn danger" title="Delete segment" onClick={() => handleRemoveSegment(i)}>
                                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <polyline points="3 6 5 6 21 6"></polyline>
                                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>

                                        <div className="segment-box" onClick={() => editSegment(i)} title="Click to edit in inspector">
                                            {seg.text}
                                        </div>

                                        <div className="audio-box">
                                            {seg.audioBuffer ? (
                                                <Waveform audioBuffer={seg.audioBuffer} />
                                            ) : (
                                                <div
                                                    style={{ color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, flex: 1, fontSize: 12 }}
                                                    onClick={() => document.getElementById(uniqueInputId).click()}
                                                >
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                                                    </svg>
                                                    Add voiceover
                                                    <input
                                                        id={uniqueInputId}
                                                        type="file"
                                                        accept="audio/*"
                                                        style={{ display: 'none' }}
                                                        onChange={(e) => handleSegmentAudioChange(i, e)}
                                                    />
                                                </div>
                                            )}
                                            <span style={{ fontSize: '12px', color: 'var(--text-dim)', marginLeft: '16px', fontFamily: 'monospace' }}>
                                                {Math.round(seg.duration)}s
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                ) : activeTab === 'video-settings' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div className="panel-header">
                            <span className="panel-eyebrow">Style</span>
                            <h3 className="panel-title">Canvas & Type</h3>
                            <p className="panel-subtitle">Background, layout and global typography for the whole video.</p>
                        </div>

                        <div className="prop-group">
                            <label>Background Color</label>
                            <CustomColorPicker initialHex={videoBgColor} onChange={setVideoBgColor} />
                        </div>

                        <div className="prop-group" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <label style={{ margin: 0 }}>Vertical Alignment</label>
                                <span style={{ fontSize: 12, color: '#fff', fontFamily: 'monospace' }}>
                                    {videoAlignPercent}% 
                                    {videoAlignPercent === 50 ? ' (Center)' : videoAlignPercent < 40 ? ' (Top)' : videoAlignPercent > 60 ? ' (Bottom)' : ''}
                                </span>
                            </div>
                            <input 
                                type="range" 
                                min="10" 
                                max="90" 
                                value={videoAlignPercent} 
                                onChange={e => setVideoAlignPercent(parseInt(e.target.value))} 
                                style={{ width: '100%', height: 4, cursor: 'pointer', margin: '8px 0' }} 
                            />
                        </div>

                        {renderTypographySettings()}
                    </div>
                ) : activeTab === 'components' ? (
                    <ComponentCreator />
                ) : null}
            </div>
        </div>
    );
};
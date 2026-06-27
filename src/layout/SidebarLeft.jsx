import React, { useContext, useState, useRef, useEffect } from 'react';
import { EditorContext } from '../context/EditorContext';
import { CustomColorPicker } from '../components/CustomColorPicker';

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
        letterSpacing, setLetterSpacing
    } = useContext(EditorContext);

    const renderTypographySettings = () => (
        <div className="typography-settings" style={{ marginTop: 32, borderTop: '1px solid var(--border)', paddingTop: 24 }}>
            <span className="context-label" style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 16, display: 'block', fontWeight: 500 }}>Global Typography</span>
            
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

    const [activeTab, setActiveTab] = useState('media');
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
                    </>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div>
                            <span className="context-label" style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, display: 'block', fontWeight: 500 }}>Canvas Settings</span>
                            <h3 className="context-title" style={{ fontSize: 20, fontWeight: 500, margin: '0 0 25px 0', color: '#fff' }}>Video Settings</h3>
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
                )}
            </div>

            <div className="sidebar-tabs">
                <button className={`sidebar-tab-btn ${activeTab === 'media' ? 'active' : ''}`} onClick={() => setActiveTab('media')}>Media</button>
                <button className={`sidebar-tab-btn ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>Video Settings</button>
            </div>
        </div>
    );
};
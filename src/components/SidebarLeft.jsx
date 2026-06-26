import React, { useContext, useState } from 'react';
import { EditorContext } from '../context/EditorContext';
import { exportVideo } from '../utils/exportEngine';

export const SidebarLeft = ({ scrollBox, charsData }) => {
    const { 
        segments, setSegments, 
        visualLines, lineSettings, 
        isPlaying, togglePlayback,
        setCurrentLineIndex, setLineSettings,
        setCharOverrides
    } = useContext(EditorContext);

    const [exportFps, setExportFps] = useState(60);
    const [exporting, setExporting] = useState(false);
    const [progress, setProgress] = useState('');

    const [newText, setNewText] = useState('');
    const [newDuration, setNewDuration] = useState(5.0);
    const [newAudioFile, setNewAudioFile] = useState(null);

    const handleExport = async () => {
        if (isPlaying) togglePlayback();
        setExporting(true);
        setProgress('Preparing...');

        await exportVideo({
            segments, visualLines, lineSettings, charsData, 
            fpsInput: exportFps, scrollBox,
            setProgress,
            onComplete: () => { setExporting(false); setTimeout(() => setProgress(''), 3000); },
            onError: () => { setExporting(false); }
        });
    };

    const handleAddSegment = async () => {
        if (!newText.trim()) return;
        
        let segAudioBuffer = null;
        let segAudioDuration = null;
        let segDuration = parseFloat(newDuration) || 5.0;

        if (newAudioFile) {
            const url = URL.createObjectURL(newAudioFile);
            const tempAudio = new Audio(url);
            await new Promise(r => {
                tempAudio.onloadedmetadata = () => {
                    segAudioDuration = tempAudio.duration;
                    segDuration = tempAudio.duration;
                    r();
                };
            });
            segAudioBuffer = await newAudioFile.arrayBuffer();
        }

        setSegments([...segments, {
            text: newText,
            duration: segDuration,
            audioBuffer: segAudioBuffer,
            audioDuration: segAudioDuration
        }]);

        setNewText('');
        setNewAudioFile(null);
    };

    const handleRemoveSegment = (index) => {
        const newSegments = [...segments];
        newSegments.splice(index, 1);
        setSegments(newSegments);
        setLineSettings({});
        setCharOverrides({});
        setCurrentLineIndex(0);
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
            <h2>Segments</h2>
            
            <div className="export-section">
                <label style={{ marginBottom: 12, color: '#fff', fontSize: 12 }}>Export to MP4</label>
                <div style={{ display: 'flex', gap: 10, marginBottom: 15, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>FPS:</span>
                    <input 
                        type="number" 
                        min="20" max="60" 
                        value={exportFps} 
                        onChange={e => setExportFps(e.target.value)}
                        style={{ marginBottom: 0, padding: 8, width: 80 }} 
                        disabled={exporting}
                    />
                </div>
                <button 
                    className="primary-btn" 
                    onClick={handleExport} 
                    disabled={exporting}
                    style={{ opacity: exporting ? 0.5 : 1 }}
                >
                    {exporting ? 'Exporting...' : 'Export Video'}
                </button>
                {progress && <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 15, textTransform: 'uppercase', letterSpacing: 1 }}>{progress}</div>}
            </div>

            <div id="segments-list">
                {segments.map((seg, i) => (
                    <div key={i} className="segment-item">
                        <p className="segment-text">"{seg.text}"</p>
                        <p className="segment-meta">Duration: {seg.duration}s</p>
                        <div className="segment-actions">
                            <button className="btn-action" onClick={() => editSegment(i)}>✎ Edit</button>
                            <button className="btn-action delete" onClick={() => handleRemoveSegment(i)}>✕</button>
                        </div>
                    </div>
                ))}
            </div>

            <div class="add-section">
                <label>Add New Text</label>
                <textarea 
                    placeholder="Type new text here..." 
                    rows="3"
                    value={newText}
                    onChange={e => setNewText(e.target.value)}
                ></textarea>
                <input 
                    type="number" 
                    step="0.5" 
                    placeholder="Duration (s)"
                    value={newDuration}
                    onChange={e => setNewDuration(e.target.value)}
                />
                <input 
                    type="file" 
                    accept="audio/*" 
                    style={{ fontSize: 11, marginBottom: 20, color: 'var(--text-muted)', width: '100%' }}
                    onChange={e => setNewAudioFile(e.target.files[0])}
                />
                <button className="primary-btn" onClick={handleAddSegment}>Add Segment</button>
            </div>
        </div>
    );
};
import React, { useContext, useState } from 'react';
import { EditorContext } from '../context/EditorContext';

export const SidebarLeft = ({ scrollBox, charsData }) => {
    const { 
        segments, setSegments, 
        visualLines, lineSettings, 
        isPlaying, togglePlayback,
        setCurrentLineIndex, setLineSettings,
        setCharOverrides, saveHistoryState
    } = useContext(EditorContext);

    const [newText, setNewText] = useState('');
    const [newDuration, setNewDuration] = useState(5.0);
    const [newAudioFile, setNewAudioFile] = useState(null);

    const handleAddSegment = async () => {
        if (!newText.trim()) return;
        saveHistoryState();
        
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
        saveHistoryState();
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

        <div className="sidebar">
            <h2>Segments</h2>

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
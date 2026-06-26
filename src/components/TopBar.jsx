import React, { useContext, useState } from 'react';
import { EditorContext } from '../context/EditorContext';
import { exportVideo } from '../utils/exportEngine';
import logo from '../assets/logo.png';

export const TopBar = ({ scrollBox, charsData }) => {
    const { 
        projectName, setProjectName,
        undo, redo, canUndo, canRedo,
        segments, visualLines, lineSettings,
        isPlaying, togglePlayback
    } = useContext(EditorContext);

    const [editMenuOpen, setEditMenuOpen] = useState(false);
    const [exportModalOpen, setExportModalOpen] = useState(false);
    const [exportFps, setExportFps] = useState(60);
    const [exporting, setExporting] = useState(false);
    const [progress, setProgress] = useState(0); 
    const [progressText, setProgressText] = useState('');

    const handleExport = async () => {
        if (isPlaying) togglePlayback();
        setExporting(true);
        setProgressText('Preparing...');
        setProgress(0);

        await exportVideo({
            segments, visualLines, lineSettings, charsData, 
            fpsInput: exportFps, scrollBox,
            setProgress: (status) => {
                setProgressText(status);
                const match = status.match(/Rendering Frame (\d+) \/ (\d+)/);
                if (match) {
                    setProgress(Math.round((parseInt(match[1]) / parseInt(match[2])) * 100));
                } else if (status === 'Export Complete!') {
                    setProgress(100);
                }
            },
            onComplete: () => { 
                setExporting(false); 
                setExportModalOpen(false); 
                setProgressText(''); 
                setProgress(0);
            },
            onError: () => { 
                setExporting(false); 
            }
        });
    };

    return (
        <>
            <div className="top-bar">
                <div className="top-bar-left">
                    <img src={logo} alt="Logo" className="top-bar-logo" />
                    <div style={{ position: 'relative' }}>
                        <button className="top-bar-btn" onClick={() => setEditMenuOpen(!editMenuOpen)}>Edit</button>
                        {editMenuOpen && (
                            <div className="edit-dropdown" onMouseLeave={() => setEditMenuOpen(false)}>
                                <button className="edit-dropdown-item" disabled={!canUndo} onClick={() => { undo(); setEditMenuOpen(false); }}>Undo</button>
                                <button className="edit-dropdown-item" disabled={!canRedo} onClick={() => { redo(); setEditMenuOpen(false); }}>Redo</button>
                            </div>
                        )}
                    </div>
                </div>
                
                <div className="top-bar-center">
                    <input 
                        type="text" 
                        className="project-title-input"
                        value={projectName}
                        onChange={(e) => setProjectName(e.target.value)}
                        placeholder="Project Name"
                        spellCheck={false}
                    />
                </div>

                <div className="top-bar-right">
                    <button className="primary-btn export-btn" onClick={() => setExportModalOpen(true)}>Export</button>
                </div>
            </div>

            {exportModalOpen && (
                <div className="export-modal-overlay">
                    <div className="export-modal">
                        {!exporting ? (
                            <>
                                <h3>Export Video</h3>
                                <div className="export-modal-body">
                                    <label>Frames Per Second (FPS):</label>
                                    <input 
                                        type="number" 
                                        min="20" max="60" 
                                        value={exportFps} 
                                        onChange={e => setExportFps(e.target.value)}
                                        className="export-fps-input"
                                    />
                                </div>
                                <div className="export-modal-footer">
                                    <button className="btn-action delete" onClick={() => setExportModalOpen(false)}>Cancel</button>
                                    <button className="primary-btn" onClick={handleExport}>Start Export</button>
                                </div>
                            </>
                        ) : (
                            <div className="export-progress-view">
                                <h3>Exporting...</h3>
                                <p className="progress-text">{progressText}</p>
                                <div className="progress-bar-bg">
                                    <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
                                </div>
                                <p className="progress-percentage">{progress}%</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
};

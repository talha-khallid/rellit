import React, { useContext, useState } from 'react';
import { EditorContext } from '../context/EditorContext';
import { exportVideo } from '../utils/exportEngine';

export const Topbar = ({ scrollBox, charsData }) => {
    const { 
        segments, 
        visualLines, lineSettings, 
        isPlaying, togglePlayback
    } = useContext(EditorContext);

    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportFps, setExportFps] = useState(60);
    const [exporting, setExporting] = useState(false);
    const [progressText, setProgressText] = useState('');
    const [progressPercent, setProgressPercent] = useState(0);

    const openModal = () => setIsExportModalOpen(true);
    const closeModal = () => {
        if (!exporting) setIsExportModalOpen(false);
    };

    const handleExport = async () => {
        if (isPlaying) togglePlayback();
        setExporting(true);
        setProgressText('Preparing...');
        setProgressPercent(0);

        await exportVideo({
            segments, visualLines, lineSettings, charsData, 
            fpsInput: exportFps, scrollBox,
            setProgress: (text, percent = 0) => {
                setProgressText(text);
                setProgressPercent(percent);
            },
            onComplete: () => { 
                setExporting(false); 
                setTimeout(() => {
                    setProgressText('');
                    setProgressPercent(0);
                    closeModal();
                }, 1500); 
            },
            onError: () => { setExporting(false); }
        });
    };

    return (
        <>
            <div className="top-bar">
                <div className="top-bar-left">
                    <div style={{ fontWeight: 600, fontSize: 16, color: '#fff', letterSpacing: 0.5 }}>Rellit</div>
                </div>
                <div className="top-bar-right">
                    <button className="top-bar-export-btn" onClick={openModal}>
                        Export
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                    </button>
                </div>
            </div>

            {isExportModalOpen && (
                <div className="export-modal-overlay">
                    <div className="export-modal">
                        <h3>Export Settings</h3>
                        <div className="export-modal-body">
                            <label>Frames Per Second (FPS)</label>
                            <input 
                                type="number" 
                                className="export-fps-input"
                                min="20" max="60" 
                                value={exportFps} 
                                onChange={e => setExportFps(e.target.value)}
                                disabled={exporting}
                            />
                        </div>
                        
                        {exporting ? (
                            <div className="export-progress-view">
                                <div className="progress-header">
                                    <p className="progress-text">{progressText}</p>
                                    <p className="progress-percentage">{progressPercent}%</p>
                                </div>
                                <div className="progress-bar-bg">
                                    <div 
                                        className="progress-bar-fill" 
                                        style={{ width: `${progressPercent}%` }}
                                    ></div>
                                </div>
                            </div>
                        ) : (
                            <div className="export-modal-footer">
                                <button className="btn-export-cancel" onClick={closeModal}>Cancel</button>
                                <button className="btn-export-start" onClick={handleExport}>Start Export</button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
};

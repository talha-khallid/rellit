import React, { useContext, useState } from 'react';
import { EditorContext } from '../context/EditorContext';
import { exportVideo } from '../utils/exportEngine';

export const Topbar = ({ scrollBox, charsData, imagesData }) => {
    const { 
        segments, 
        visualLines, lineSettings, 
        isPlaying, togglePlayback,
        videoBgColor,
        activeTab, setActiveTab,
        onGoHome,
        projectName,
        updateName
    } = useContext(EditorContext);

    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportFps, setExportFps] = useState(60);
    const [exporting, setExporting] = useState(false);
    const [progressText, setProgressText] = useState('');
    const [progressPercent, setProgressPercent] = useState(0);

    const [isEditing, setIsEditing] = useState(false);
    const [tempName, setTempName] = useState('');

    const handleStartEditing = () => {
        setTempName(projectName || '');
        setIsEditing(true);
    };

    const handleSave = () => {
        if (tempName.trim()) {
            updateName(tempName.trim());
        }
        setIsEditing(false);
    };

    const handleInputKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleSave();
        } else if (e.key === 'Escape') {
            setIsEditing(false);
        }
    };

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
            segments,
            visualLines,
            lineSettings,
            charsData,
            imagesData,
            fpsInput: exportFps,
            scrollBox,
            videoBgColor,
            setProgress: (text, percent = 0) => {
                setProgressText(text);
                setProgressPercent(percent);
                document.title = `${percent}% • Exporting`;
                
                const favicon = document.getElementById('favicon');
                if (favicon) {
                    const canvas = document.createElement('canvas');
                    canvas.width = 32;
                    canvas.height = 32;
                    const ctx = canvas.getContext('2d');
                    
                    ctx.beginPath();
                    ctx.arc(16, 16, 14, 0, Math.PI * 2);
                    ctx.fillStyle = '#2d2d2d';
                    ctx.fill();
                    
                    ctx.beginPath();
                    ctx.moveTo(16, 16);
                    ctx.arc(16, 16, 14, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * (percent / 100)));
                    ctx.fillStyle = '#863bff';
                    ctx.fill();
                    
                    favicon.href = canvas.toDataURL('image/png');
                }
            },
            onComplete: () => { 
                setExporting(false); 
                document.title = 'Rellit';
                const favicon = document.getElementById('favicon');
                if (favicon) favicon.href = '/favicon.svg';
                
                setTimeout(() => {
                    setProgressText('');
                    setProgressPercent(0);
                    closeModal();
                }, 1500); 
            },
            onError: () => { 
                setExporting(false);
                document.title = 'Rellit';
                const favicon = document.getElementById('favicon');
                if (favicon) favicon.href = '/favicon.svg';
            }
        });
    };

    return (
        <>
            <div className="top-bar">
                <div className="top-bar-left">
                    <div 
                        style={{ fontWeight: 600, fontSize: 16, color: '#fff', letterSpacing: 0.5, marginRight: 24, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'color 0.2s' }}
                        onMouseOver={e => e.currentTarget.style.color = '#863bff'}
                        onMouseOut={e => e.currentTarget.style.color = '#fff'}
                        onClick={onGoHome}
                        title="Back to Projects"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                            <polyline points="9 22 9 12 15 12 15 22"></polyline>
                        </svg>
                        Rellit
                    </div>
                    
                    <div className="top-bar-tabs" style={{ marginLeft: 30 }}>
                        <button 
                            className={`tab-btn ${activeTab === 'media' ? 'active' : ''}`}
                            onClick={() => setActiveTab('media')}
                        >Media</button>
                        <button 
                            className={`tab-btn ${activeTab === 'video-settings' ? 'active' : ''}`}
                            onClick={() => setActiveTab('video-settings')}
                        >Video Settings</button>
                        <button 
                            className={`tab-btn ${activeTab === 'components' ? 'active' : ''}`}
                            onClick={() => setActiveTab('components')}
                        >Components</button>
                    </div>
                </div>
                <div className="top-bar-center">
                    {isEditing ? (
                        <input
                            type="text"
                            className="project-name-input"
                            value={tempName}
                            onChange={(e) => setTempName(e.target.value)}
                            onBlur={handleSave}
                            onKeyDown={handleInputKeyDown}
                            autoFocus
                        />
                    ) : (
                        <div className="project-name-wrapper" onClick={handleStartEditing} title="Click to rename project">
                            <span className="project-name-text">{projectName || 'Untitled Project'}</span>
                            <span className="project-name-edit-icon">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                            </span>
                        </div>
                    )}
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

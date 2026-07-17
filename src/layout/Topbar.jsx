import React, { useContext, useState } from 'react';
import { EditorContext } from '../context/EditorContext';
import { exportVideo } from '../utils/exportEngine';

const FPS_OPTIONS = [24, 30, 60];
const QUALITY_OPTIONS = [
    { label: 'Full HD', scale: 1, res: '1080 × 1920' },
    { label: '4K Ultra', scale: 2, res: '2160 × 3840' }
];

export const Topbar = ({ scrollBox, charsData, imagesData }) => {
    const {
        segments,
        visualLines, lineSettings,
        isPlaying, togglePlayback,
        videoBgColor,
        fontFamily, fontWeight, fontSize, textTransform,
        onGoHome,
        projectName,
        updateName,
        saveStatus
    } = useContext(EditorContext);

    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportFps, setExportFps] = useState(60);
    const [exportScale, setExportScale] = useState(1);
    const [exporting, setExporting] = useState(false);
    const [progressText, setProgressText] = useState('');
    const [progressPercent, setProgressPercent] = useState(0);

    const [isEditing, setIsEditing] = useState(false);
    const [tempName, setTempName] = useState('');

    const totalDuration = visualLines.reduce((acc, _, i) => acc + parseFloat(lineSettings[i]?.duration || 0.1), 0);
    const formatClock = (secs) => {
        const m = Math.floor(secs / 60).toString().padStart(2, '0');
        const s = Math.floor(secs % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

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
            exportScale,
            fontFamily,
            fontWeight,
            fontSize,
            textTransform,
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
                    ctx.fillStyle = '#8b5cf6';
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
                    <div className="top-bar-home" onClick={onGoHome} title="Back to Projects">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="15 18 9 12 15 6"></polyline>
                        </svg>
                        Rellit
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
                    <div className={`save-indicator ${saveStatus}`} title={saveStatus === 'error' ? "Couldn't save — check that the dev server is running" : "Changes are saved automatically"}>
                        {saveStatus === 'saving' ? (
                            <>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                    <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
                                </svg>
                                Saving...
                            </>
                        ) : saveStatus === 'error' ? (
                            <>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <line x1="12" y1="8" x2="12" y2="12"></line>
                                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                                </svg>
                                Save failed
                            </>
                        ) : (
                            <>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                                Saved
                            </>
                        )}
                    </div>
                    <button className="top-bar-export-btn" onClick={openModal}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        Export
                    </button>
                </div>
            </div>

            {isExportModalOpen && (
                <div className="export-modal-overlay" onClick={closeModal}>
                    <div className="export-modal" onClick={e => e.stopPropagation()}>
                        <h3>Export Video</h3>
                        <p className="export-modal-sub">Renders your project to an MP4 file.</p>
                        <div className="export-modal-body">
                            <label>Quality</label>
                            <div className="export-fps-row">
                                {QUALITY_OPTIONS.map(q => (
                                    <button
                                        key={q.scale}
                                        className={`export-fps-chip ${exportScale === q.scale ? 'active' : ''}`}
                                        onClick={() => setExportScale(q.scale)}
                                        disabled={exporting}
                                    >
                                        {q.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="export-modal-body">
                            <label>Frame Rate</label>
                            <div className="export-fps-row">
                                {FPS_OPTIONS.map(fps => (
                                    <button
                                        key={fps}
                                        className={`export-fps-chip ${exportFps === fps ? 'active' : ''}`}
                                        onClick={() => setExportFps(fps)}
                                        disabled={exporting}
                                    >
                                        {fps} fps
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="export-meta-row">
                            <span>Resolution</span>
                            <span>{QUALITY_OPTIONS.find(q => q.scale === exportScale)?.res}</span>
                        </div>
                        <div className="export-meta-row">
                            <span>Duration</span>
                            <span>{formatClock(totalDuration)}</span>
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

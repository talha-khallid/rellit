import React, { useContext, useState, useRef, useEffect } from 'react';
import { EditorContext } from '../context/EditorContext';
import { exportVideo } from '../utils/exportEngine';

export const TopBar = ({ scrollBox, charsData }) => {
    const { 
        past, future, undo, redo,
        exportFps, setExportFps,
        exporting, setExporting,
        setExportProgress,
        isPlaying, togglePlayback,
        segments, visualLines, lineSettings
    } = useContext(EditorContext);

    const [editMenuOpen, setEditMenuOpen] = useState(false);
    const [exportMenuOpen, setExportMenuOpen] = useState(false);
    
    const editRef = useRef(null);
    const exportRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (editRef.current && !editRef.current.contains(event.target)) {
                setEditMenuOpen(false);
            }
            if (exportRef.current && !exportRef.current.contains(event.target)) {
                setExportMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleExport = async () => {
        setExportMenuOpen(false);
        if (isPlaying) togglePlayback();
        setExporting(true);
        setExportProgress('Preparing...');

        await exportVideo({
            segments, visualLines, lineSettings, charsData, 
            fpsInput: exportFps, scrollBox,
            setProgress: setExportProgress,
            onComplete: () => { setExporting(false); setTimeout(() => setExportProgress(''), 3000); },
            onError: () => { setExporting(false); }
        });
    };

    return (
        <div className="top-bar">
            <div className="top-bar-left">
                <div className="logo">Rellit</div>
                
                <div className="dropdown-container" ref={editRef}>
                    <button 
                        className={`top-bar-btn ${editMenuOpen ? 'active' : ''}`}
                        onClick={() => { setEditMenuOpen(!editMenuOpen); setExportMenuOpen(false); }}
                    >
                        Edit
                    </button>
                    {editMenuOpen && (
                        <div className="dropdown-menu">
                            <button 
                                className="dropdown-item" 
                                onClick={() => { undo(); setEditMenuOpen(false); }}
                                disabled={past.length === 0}
                            >
                                Undo <span className="shortcut">Ctrl+Z</span>
                            </button>
                            <button 
                                className="dropdown-item" 
                                onClick={() => { redo(); setEditMenuOpen(false); }}
                                disabled={future.length === 0}
                            >
                                Redo <span className="shortcut">Ctrl+Y</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <div className="top-bar-right">
                <div className="dropdown-container" ref={exportRef}>
                    <button 
                        className={`top-bar-btn primary ${exportMenuOpen ? 'active' : ''}`}
                        onClick={() => { setExportMenuOpen(!exportMenuOpen); setEditMenuOpen(false); }}
                    >
                        Export
                    </button>
                    {exportMenuOpen && (
                        <div className="dropdown-menu right-aligned export-menu">
                            <div className="menu-group">
                                <label>FPS Settings</label>
                                <div className="fps-control">
                                    <input 
                                        type="number" 
                                        min="20" max="60" 
                                        value={exportFps} 
                                        onChange={e => setExportFps(e.target.value)}
                                    />
                                    <span>fps</span>
                                </div>
                            </div>
                            <div className="menu-divider"></div>
                            <button 
                                className="primary-btn full-width" 
                                onClick={handleExport}
                            >
                                Render MP4
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

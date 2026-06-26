import React, { useState } from 'react';
import { SidebarLeft } from './SidebarLeft';
import { SidebarRight } from './SidebarRight';
import { Preview } from './Preview';
import { Timeline } from './Timeline';
import { TopBar } from './TopBar';
import { EditorContext } from '../context/EditorContext';

export const AppLayout = () => {
    const { exporting, exportProgress } = React.useContext(EditorContext);
    // We lift these two state variables here because they are needed by the export engine,
    // which is triggered in SidebarLeft, but populated by Preview.
    const [scrollBox, setScrollBox] = useState({ x: 0, y: 0, w: 0, h: 0 });
    const [charsData, setCharsData] = useState([]);

    return (
        <div className="app-container">
            <TopBar scrollBox={scrollBox} charsData={charsData} />
            <div className="main-workspace">
                <SidebarLeft scrollBox={scrollBox} charsData={charsData} />
                <Preview setScrollBox={setScrollBox} setCharsData={setCharsData} />
                <SidebarRight />
            </div>
            <Timeline />

            {exporting && (
                <div className="export-modal-overlay">
                    <div className="export-modal-content">
                        <div className="spinner"></div>
                        <h3 style={{ margin: '0 0 10px 0', color: '#fff', fontSize: '18px' }}>Exporting Video</h3>
                        <p style={{ margin: 0, color: 'var(--accent)', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                            {exportProgress || 'Preparing...'}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

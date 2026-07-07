import React, { useState, useEffect, useContext } from 'react';
import { EditorContext } from '../context/EditorContext';
import { SidebarLeft } from './SidebarLeft';
import { IconRail } from './IconRail';
import { SidebarRight } from './SidebarRight';
import { Preview } from './Preview';
import { Timeline } from './Timeline';
import { Topbar } from './Topbar';

export const AppLayout = () => {
    // We lift these two state variables here because they are needed by the export engine,
    // which is triggered in SidebarLeft, but populated by Preview.
    const [scrollBox, setScrollBox] = useState({ x: 0, y: 0, w: 0, h: 0 });
    const [charsData, setCharsData] = useState([]);
    const [imagesData, setImagesData] = useState([]);

    const { togglePlayback } = useContext(EditorContext);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.code === 'Space') {
                const tag = e.target.tagName.toLowerCase();
                // If user is typing in an input or textarea, let them type spaces
                if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
                
                e.preventDefault(); // Prevent default browser scrolling
                togglePlayback();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [togglePlayback]);

    return (
        <div className="app-container">
            <Topbar scrollBox={scrollBox} charsData={charsData} imagesData={imagesData} />
            <div className="main-workspace">
                <IconRail />
                <SidebarLeft scrollBox={scrollBox} charsData={charsData} />
                <Preview setScrollBox={setScrollBox} setCharsData={setCharsData} setImagesData={setImagesData} />
                <SidebarRight />
            </div>
            <Timeline />
        </div>
    );
};

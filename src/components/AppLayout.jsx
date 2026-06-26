import React, { useState } from 'react';
import { SidebarLeft } from './SidebarLeft';
import { SidebarRight } from './SidebarRight';
import { Preview } from './Preview';
import { Timeline } from './Timeline';
import { TopBar } from './TopBar';

export const AppLayout = () => {
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
        </div>
    );
};

import React, { useState } from 'react';
import { SidebarLeft } from '../sidebar-left/SidebarLeft';
import { SidebarRight } from '../sidebar-right/SidebarRight';
import { Preview } from '../preview/Preview';
import { Timeline } from '../timeline/Timeline';

export const AppLayout = () => {
    // We lift these two state variables here because they are needed by the export engine,
    // which is triggered in SidebarLeft, but populated by Preview.
    const [scrollBox, setScrollBox] = useState({ x: 0, y: 0, w: 0, h: 0 });
    const [charsData, setCharsData] = useState([]);

    return (
        <div className="app-container">
            <div className="main-workspace">
                <SidebarLeft scrollBox={scrollBox} charsData={charsData} />
                <Preview setScrollBox={setScrollBox} setCharsData={setCharsData} />
                <SidebarRight />
            </div>
            <Timeline />
        </div>
    );
};

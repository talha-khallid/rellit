import React, { useRef, useLayoutEffect } from 'react';

export const AudioWaveform = ({ audioBuffer, width, height = 40 }) => {
    const canvasRef = useRef(null);

    useLayoutEffect(() => {
        // audioBuffer may be a not-yet-decoded placeholder (e.g. right after a
        // project load, before its stored audio is turned back into an AudioBuffer),
        // so guard against calling AudioBuffer methods on a non-AudioBuffer.
        if (!canvasRef.current || !audioBuffer || typeof audioBuffer.getChannelData !== 'function' || width <= 0) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        // Scale for high DPI displays (Retina)
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);

        ctx.clearRect(0, 0, width, height);

        const data = audioBuffer.getChannelData(0);
        
        // Settings for the bars
        const barWidth = 2.5;
        const gap = 2.5;
        const stepPixels = barWidth + gap;
        const numBars = Math.floor(width / stepPixels);
        const samplesPerBar = Math.floor(data.length / numBars);
        
        const amp = height / 2;

        ctx.lineWidth = barWidth;
        ctx.lineCap = 'round';

        ctx.beginPath();
        for (let i = 0; i < numBars; i++) {
            let max = 0;
            const offset = i * samplesPerBar;
            // Find max absolute amplitude in this chunk
            for (let j = 0; j < samplesPerBar; j++) {
                const datum = Math.abs(data[offset + j]);
                if (datum > max) max = datum;
            }

            const h = Math.max(2, max * amp * 1.8); // Scale up slightly, min height 2px
            const x = i * stepPixels + (barWidth / 2);
            
            ctx.moveTo(x, amp - h/2);
            ctx.lineTo(x, amp + h/2);
        }
        
        // We'll draw them all in a clean light grey/white
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.stroke();
    }, [audioBuffer, width, height]);

    return (
        <div style={{ width: `${width}px`, height: `${height}px`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <canvas 
                ref={canvasRef} 
                style={{ width: `${width}px`, height: `${height}px`, display: 'block' }} 
            />
        </div>
    );
};

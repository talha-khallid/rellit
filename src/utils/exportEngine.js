import * as Mp4Muxer from 'mp4-muxer';
import { hexToRgb } from './colorUtils';

export async function exportVideo({
    segments,
    visualLines,
    lineSettings,
    charsData,
    imagesData = [],
    fpsInput,
    scrollBox,
    setProgress,
    onComplete,
    onError,
    videoBgColor
}) {
    const fps = isNaN(fpsInput) ? 60 : Math.max(20, Math.min(60, fpsInput));

    const yieldToMain = () => new Promise(resolve => {
        const channel = new MessageChannel();
        channel.port1.onmessage = resolve;
        channel.port2.postMessage(null);
    });

    try {
        let totalDuration = 0;
        for (let i = 0; i < visualLines.length; i++) {
            totalDuration += parseFloat(lineSettings[i]?.duration || 0);
        }
        const totalFrames = Math.ceil(totalDuration * fps);

        const hasAnyAudio = segments.some(s => s.audioBuffer);
        let EXPORT_SAMPLE_RATE = 48000;
        let audioCodecConfig = 'mp4a.40.2';
        let muxerAudioCodec = 'aac';

        if (hasAnyAudio) {
            try {
                const support = await AudioEncoder.isConfigSupported({
                    codec: 'mp4a.40.2',
                    sampleRate: EXPORT_SAMPLE_RATE,
                    numberOfChannels: 2
                });
                if (!support.supported) throw new Error("AAC not supported");
            } catch (e) {
                audioCodecConfig = 'opus';
                muxerAudioCodec = 'opus';
            }
        }

        const muxerOptions = {
            target: new Mp4Muxer.ArrayBufferTarget(),
            video: { codec: 'avc', width: 1080, height: 1920 },
            fastStart: 'in-memory'
        };

        const segmentAudioData = {};
        let audioEncoder = null;

        if (hasAnyAudio) {
            for (let i = 0; i < segments.length; i++) {
                if (segments[i].audioBuffer) {
                    segmentAudioData[i] = segments[i].audioBuffer;
                }
            }
            muxerOptions.audio = { codec: muxerAudioCodec, sampleRate: EXPORT_SAMPLE_RATE, numberOfChannels: 2 };
        }

        const muxer = new Mp4Muxer.Muxer(muxerOptions);

        if (hasAnyAudio) {
            audioEncoder = new AudioEncoder({
                output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
                error: e => console.error(e)
            });
            audioEncoder.configure({
                codec: audioCodecConfig,
                sampleRate: EXPORT_SAMPLE_RATE,
                numberOfChannels: 2,
                bitrate: 256_000
            });
        }

        const videoEncoder = new VideoEncoder({
            output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
            error: e => console.error(e)
        });

        videoEncoder.configure({
            codec: 'avc1.640034',
            width: 1080,
            height: 1920,
            hardwareAcceleration: 'prefer-software',
            bitrate: 10_000_000,
            framerate: fps
        });

        const offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = 1080;
        offscreenCanvas.height = 1920;
        const ctx = offscreenCanvas.getContext('2d', { alpha: false, willReadFrequently: true });
        ctx.font = '500 43.5px Inter, -apple-system, BlinkMacSystemFont, Roboto, sans-serif';
        ctx.textBaseline = 'top';

        const rgb = hexToRgb(videoBgColor || '#050505');
        const bgRgba = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`;
        const bgRgba75 = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.75)`;
        const bgRgba0 = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`;

        // Preload images
        const preloadedImages = {};
        for (let imgD of imagesData) {
            if (!preloadedImages[imgD.src]) {
                const img = new Image();
                img.src = imgD.src;
                await new Promise((resolve) => {
                    img.onload = resolve;
                    img.onerror = resolve; // Continue on error to avoid hanging
                });
                preloadedImages[imgD.src] = img;
            }
        }

        let currentTimeMs = 0;
        const frameTimeMs = 1000 / fps;

        for (let frame = 0; frame < totalFrames; frame++) {
            if (frame % 5 === 0) {
                const percent = Math.round((frame / totalFrames) * 100);
                setProgress(`Rendering Frame ${frame + 1} / ${totalFrames}`, percent);
                await yieldToMain();
            }

            let lineStartTimeMs = 0;
            let activeIdx = 0;
            let found = false;

            for (let i = 0; i < visualLines.length; i++) {
                const durMs = parseFloat(lineSettings[i].duration) * 1000;
                if (currentTimeMs >= lineStartTimeMs && currentTimeMs < lineStartTimeMs + durMs) { activeIdx = i; found = true; break; }
                lineStartTimeMs += durMs;
            }

            if (!found) {
                activeIdx = visualLines.length - 1;
                lineStartTimeMs = 0;
                for (let i = 0; i < visualLines.length - 1; i++) lineStartTimeMs += parseFloat(lineSettings[i].duration) * 1000;
            }

            const timeInLineMs = currentTimeMs - lineStartTimeMs;
            const activeLineSpans = visualLines[activeIdx];
            const settings = lineSettings[activeIdx];
            const containerHeight = scrollBox.h;

            const targetTranslation = (containerHeight / 2) - (activeLineSpans[0].offsetTop + activeLineSpans[0].offsetHeight / 2);
            let prevTranslation = targetTranslation;

            if (activeIdx > 0 && timeInLineMs < 600) {
                const prevSpans = visualLines[activeIdx - 1];
                prevTranslation = (containerHeight / 2) - (prevSpans[0].offsetTop + prevSpans[0].offsetHeight / 2);
            }

            let trackProgress = Math.min(timeInLineMs / 600, 1.0);
            trackProgress = 1 - Math.pow(1 - trackProgress, 4);
            const currentTranslation = prevTranslation + (targetTranslation - prevTranslation) * trackProgress;

            let colorProgress = Math.min(timeInLineMs / 100, 1.0);

            ctx.fillStyle = videoBgColor || '#050505';
            ctx.fillRect(0, 0, 1080, 1920);

            // cubic-bezier(0.4, 0, 0.2, 1) approximation - Material Design standard easing
            const cubicEase = (t) => {
                // Attempt to closely match cubic-bezier(0.4, 0, 0.2, 1)
                // Using a polynomial approximation
                if (t <= 0) return 0;
                if (t >= 1) return 1;
                return t < 0.5
                    ? 4 * t * t * t
                    : 1 - Math.pow(-2 * t + 2, 3) / 2;
            };

            // Pre-calculate text shifts for collapsed components on inactive lines
            const lineShifts = {};
            for (let imgD of imagesData) {
                if (imgD.inactiveBehavior === 'collapse') {
                    if (!lineShifts[imgD.lineIdx]) lineShifts[imgD.lineIdx] = [];
                    const targetFontSize = lineSettings[imgD.lineIdx]?.fontSize || 45;
                    const fullShift = imgD.width + (0.25 * targetFontSize);
                    let shiftAmount = 0;

                    if (imgD.lineIdx === activeIdx) {
                        // Expanding: from fullShift to 0 over 250ms (matches CSS 0.25s ease-out)
                        const p = Math.min(timeInLineMs / 250, 1.0);
                        const easeP = 1 - Math.pow(1 - p, 3); // ease-out
                        shiftAmount = fullShift * (1 - easeP);
                    } else if (imgD.lineIdx === activeIdx - 1) {
                        // Collapsing: from 0 to fullShift over 300ms (matches CSS 0.3s ease-in-out)
                        const p = Math.min(timeInLineMs / 300, 1.0);
                        const easeP = cubicEase(p);
                        shiftAmount = fullShift * easeP;
                    } else if (imgD.lineIdx !== activeIdx) {
                        // Fully collapsed
                        shiftAmount = fullShift;
                    }

                    if (shiftAmount > 0) {
                        lineShifts[imgD.lineIdx].push({
                            baseX: imgD.baseX,
                            shift: shiftAmount
                        });
                    }
                }
            }

            for (let c of charsData) {
                let isCharActive = (c.lineIdx === activeIdx);
                let charColor = '#a6a6a6';

                if (isCharActive) {
                    const targetColor = c.overrideColor || settings?.color || '#ffffff';
                    const c1 = hexToRgb('#a6a6a6');
                    const c2 = hexToRgb(targetColor);
                    const r = Math.round(c1.r + (c2.r - c1.r) * colorProgress);
                    const g = Math.round(c1.g + (c2.g - c1.g) * colorProgress);
                    const b = Math.round(c1.b + (c2.b - c1.b) * colorProgress);
                    charColor = `rgb(${r},${g},${b})`;

                    if (colorProgress > 0) { ctx.shadowColor = charColor; ctx.shadowBlur = 2; }
                    else { ctx.shadowBlur = 0; }
                } else { ctx.shadowBlur = 0; }
                
                let charShift = 0;
                if (lineShifts[c.lineIdx]) {
                    for (let collapse of lineShifts[c.lineIdx]) {
                        if (c.baseX > collapse.baseX) {
                            charShift -= collapse.shift;
                        }
                    }
                }

                ctx.fillStyle = charColor;
                ctx.fillText(c.text, c.baseX + charShift, c.baseY + currentTranslation);
            }

            // Draw Images
            for (let imgD of imagesData) {
                let isImgActive = (imgD.lineIdx === activeIdx);
                let isImgCollapsing = (imgD.inactiveBehavior === 'collapse' && imgD.lineIdx === activeIdx - 1 && timeInLineMs < 300);
                let shouldRender = isImgActive || imgD.inactiveBehavior === 'dimmed' || isImgCollapsing;
                
                if (shouldRender) {
                    const img = preloadedImages[imgD.src];
                    if (img && img.width) {
                        ctx.save();
                        
                        let scale = 1;
                        let rotation = 0;
                        let opacity = 1;
                        let translateY = 0;
                        let translateX = 0;
                        let currentLayoutWidth = imgD.width;

                        if (lineShifts[imgD.lineIdx]) {
                            for (let collapse of lineShifts[imgD.lineIdx]) {
                                if (imgD.baseX > collapse.baseX) {
                                    translateX -= collapse.shift;
                                }
                            }
                        }
                        
                        if (!isImgActive) {
                            if (imgD.inactiveBehavior === 'collapse' && imgD.lineIdx === activeIdx - 1) {
                                // Collapsing: matched to CSS 0.3s cubic-bezier(0.4, 0, 0.2, 1)
                                const p = Math.min(timeInLineMs / 300, 1.0);
                                const easeP = cubicEase(p);
                                currentLayoutWidth = imgD.width * (1 - easeP);
                                scale = 1 - easeP; // visual scale perfectly matches width shrink
                                opacity = 1 - easeP;
                                rotation = 0;
                            } else if (imgD.inactiveBehavior === 'collapse') {
                                currentLayoutWidth = 0;
                                scale = 0;
                                opacity = 0;
                                rotation = 0;
                            } else {
                                scale = 0.8;
                                rotation = 0;
                                opacity = imgD.inactiveBehavior === 'collapse' ? 0 : 0.5;
                                ctx.filter = 'grayscale(100%)';
                            }
                        } else {
                            if (imgD.inactiveBehavior === 'collapse' && timeInLineMs < 250) {
                                // Expanding
                                const p = Math.min(timeInLineMs / 250, 1.0);
                                const easeP = 1 - Math.pow(1 - p, 3); // ease-out
                                currentLayoutWidth = imgD.width * easeP;
                                scale = easeP;
                                opacity = easeP;
                            }
                            if (imgD.animation === 'dim-scale-rotate-left' || imgD.animation === 'dim-scale-rotate-right') {
                                const p = Math.min(timeInLineMs / 500, 1.0);
                                if (p < 0.5) {
                                    const subP = p / 0.5;
                                    scale = 0.8 + (0.2 * subP);
                                    rotation = 0;
                                    opacity = 0.5 + (0.5 * subP);
                                    ctx.filter = `grayscale(${100 - (100 * subP)}%)`;
                                } else {
                                    const subP = (p - 0.5) / 0.5;
                                    scale = 1;
                                    rotation = (imgD.animation === 'dim-scale-rotate-right' ? 15 : -15) * subP;
                                    opacity = 1;
                                    ctx.filter = 'grayscale(0%)';
                                }
                            } else if (imgD.animation === 'dim-scale') {
                                const p = Math.min(timeInLineMs / 300, 1.0);
                                scale = 0.8 + (0.2 * p);
                                opacity = 0.5 + (0.5 * p);
                                ctx.filter = `grayscale(${100 - (100 * p)}%)`;
                            } else if (imgD.animation === 'dim-bounce-rotate') {
                                const p = Math.min(timeInLineMs / 500, 1.0);
                                scale = 0.8 + (0.2 * p);
                                rotation = -30 * p;
                                opacity = 0.5 + (0.5 * p);
                                ctx.filter = `grayscale(${100 - (100 * p)}%)`;
                            } else if (imgD.animation === 'pop-rotate' || imgD.animation === 'scale-rotate-left') {
                                const p = Math.min(timeInLineMs / 500, 1.0);
                            if (p < 0.5) {
                                const subP = p / 0.5;
                                scale = subP;
                                rotation = 0;
                                opacity = subP;
                            } else {
                                const subP = (p - 0.5) / 0.5;
                                scale = 1;
                                rotation = -15 * subP;
                                opacity = 1;
                            }
                        } else if (imgD.animation === 'pop-rotate-right' || imgD.animation === 'scale-rotate-right') {
                            const p = Math.min(timeInLineMs / 500, 1.0);
                            if (p < 0.5) {
                                const subP = p / 0.5;
                                scale = subP;
                                rotation = 0;
                                opacity = subP;
                            } else {
                                const subP = (p - 0.5) / 0.5;
                                scale = 1;
                                rotation = 15 * subP;
                                opacity = 1;
                            }
                        } else if (imgD.animation === 'pop') {
                            const p = Math.min(timeInLineMs / 300, 1.0);
                            scale = 0.5 + (0.5 * p);
                            opacity = p;
                        } else if (imgD.animation === 'scale') {
                            const p = Math.min(timeInLineMs / 300, 1.0);
                            scale = p;
                            opacity = p;
                        } else if (imgD.animation === 'bounce-rotate') {
                            const p = Math.min(timeInLineMs / 500, 1.0);
                            if (p < 0.6) {
                                // 0 to 60%
                                const subP = p / 0.6;
                                // simple bezier approximation for overshoot
                                scale = subP * 1.15;
                                rotation = -45 + (55 * subP);
                                opacity = subP;
                            } else {
                                // 60% to 100%
                                const subP = (p - 0.6) / 0.4;
                                scale = 1.15 - (0.15 * subP);
                                rotation = 10 - (10 * subP);
                                opacity = 1;
                            }
                        } else if (imgD.animation === 'slide-up') {
                            const p = Math.min(timeInLineMs / 300, 1.0);
                            translateY = 15 - (15 * p);
                            opacity = p;
                        } else if (imgD.animation === 'slide-down') {
                            const p = Math.min(timeInLineMs / 300, 1.0);
                            translateY = -15 + (15 * p);
                            opacity = p;
                        } else if (imgD.animation === 'spin-in') {
                            const p = Math.min(timeInLineMs / 400, 1.0);
                            scale = p;
                            rotation = -180 + (180 * p);
                            opacity = p;
                        } else if (imgD.animation === 'fade') {
                            const p = Math.min(timeInLineMs / 300, 1.0);
                            opacity = p;
                        }
                        } // Close else block
                        
                        ctx.globalAlpha = opacity;
                        
                        const targetWidth = imgD.width * scale;
                        const targetHeight = imgD.height * scale;

                        ctx.translate(imgD.baseX + translateX + (currentLayoutWidth / 2), imgD.baseY + currentTranslation + translateY + (imgD.height / 2));
                        if (rotation !== 0) ctx.rotate(rotation * Math.PI / 180);
                        if (scale !== 1) ctx.scale(scale, scale);
                        
                        ctx.drawImage(img, -imgD.width / 2, -imgD.height / 2, imgD.width, imgD.height);
                        ctx.restore();
                    }
                }
            }

            ctx.shadowBlur = 0;
            const grad = ctx.createLinearGradient(0, scrollBox.y, 0, scrollBox.y + scrollBox.h);
            grad.addColorStop(0, bgRgba); grad.addColorStop(0.15, bgRgba75);
            grad.addColorStop(0.40, bgRgba0); grad.addColorStop(0.60, bgRgba0);
            grad.addColorStop(0.85, bgRgba75); grad.addColorStop(1.0, bgRgba);

            ctx.fillStyle = grad;
            ctx.fillRect(0, scrollBox.y, 1080, scrollBox.h);

            ctx.fillStyle = videoBgColor || '#050505';
            ctx.fillRect(0, 0, 1080, scrollBox.y);
            ctx.fillRect(0, scrollBox.y + scrollBox.h, 1080, 1920 - (scrollBox.y + scrollBox.h));

            const videoFrame = new VideoFrame(offscreenCanvas, { timestamp: currentTimeMs * 1000 });
            videoEncoder.encode(videoFrame, { keyFrame: frame % 30 === 0 });
            videoFrame.close();

            currentTimeMs += frameTimeMs;
        }

        if (audioEncoder) {
            setProgress("Encoding Audio...", 100);
            await yieldToMain();

            const chunkFrames = 4096;
            let globalTime = 0;

            for (let segIdx = 0; segIdx < segments.length; segIdx++) {
                let segDuration = 0;
                for (let i = 0; i < visualLines.length; i++) { if (visualLines[i][0].segIndex == segIdx) segDuration += parseFloat(lineSettings[i].duration); }

                const decodedAudio = segmentAudioData[segIdx];
                const segFrames = Math.floor(segDuration * EXPORT_SAMPLE_RATE);
                let offset = 0;

                while (offset < segFrames) {
                    const curChunkFrames = Math.min(chunkFrames, segFrames - offset);
                    const planarData = new Float32Array(2 * curChunkFrames);

                    if (decodedAudio) {
                        for (let c = 0; c < 2; c++) {
                            const channelIndex = c < decodedAudio.numberOfChannels ? c : 0;
                            const channelData = decodedAudio.getChannelData(channelIndex);
                            const available = Math.max(0, decodedAudio.length - offset);
                            const copyLen = Math.min(curChunkFrames, available);
                            if (copyLen > 0) planarData.set(channelData.subarray(offset, offset + copyLen), c * curChunkFrames);
                        }
                    }

                    const audioData = new AudioData({ format: 'f32-planar', sampleRate: EXPORT_SAMPLE_RATE, numberOfChannels: 2, numberOfFrames: curChunkFrames, timestamp: (globalTime * 1000000), data: planarData });
                    if (audioEncoder.state === 'configured') audioEncoder.encode(audioData);
                    audioData.close();

                    offset += curChunkFrames;
                    globalTime += (curChunkFrames / EXPORT_SAMPLE_RATE);
                }
            }
            await audioEncoder.flush();
        }

        setProgress("Multiplexing MP4...", 100);
        await videoEncoder.flush();
        muxer.finalize();

        const buffer = muxer.target.buffer;
        const blob = new Blob([buffer], { type: 'video/mp4' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'captions-export.mp4';
        a.click();
        URL.revokeObjectURL(url);

        setProgress("Export Complete!", 100);
        if (onComplete) onComplete();
    } catch (err) {
        console.error(err);
        setProgress("Error: " + err.message, 0);
        if (onError) onError(err);
    }
}

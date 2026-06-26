import * as Mp4Muxer from 'mp4-muxer';
import { hexToRgb } from './colorUtils';

export async function exportVideo({
    segments,
    visualLines,
    lineSettings,
    charsData,
    fpsInput,
    scrollBox,
    setProgress,
    onComplete,
    onError,
    videoBgColor
}) {
    const fps = isNaN(fpsInput) ? 60 : Math.max(20, Math.min(60, fpsInput));

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

        let currentTimeMs = 0;
        const frameTimeMs = 1000 / fps;

        for (let frame = 0; frame < totalFrames; frame++) {
            if (frame % 5 === 0) {
                const percent = Math.round((frame / totalFrames) * 100);
                setProgress(`Rendering Frame ${frame + 1} / ${totalFrames}`, percent);
                await new Promise(r => setTimeout(r, 0));
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

                ctx.fillStyle = charColor;
                ctx.fillText(c.text, c.baseX, c.baseY + currentTranslation);
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
            await new Promise(r => setTimeout(r, 0));

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

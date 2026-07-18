import * as Mp4Muxer from 'mp4-muxer';
import { hexToRgb } from './colorUtils';
import { getMediaFrameGeometry, composeCropView, sampleKeyframes, mediaLocalProgress, clamp, MEDIA_IMAGE_RADIUS } from './mediaLayout';

// Seek a <video> to a time and resolve once the frame is ready to draw. Has a
// safety timeout so a missed 'seeked' event can't stall the whole export.
function seekVideoTo(v, time) {
    return new Promise((resolve) => {
        if (Math.abs(v.currentTime - time) < 0.001) { resolve(); return; }
        let done = false;
        const finish = () => { if (done) return; done = true; v.removeEventListener('seeked', finish); resolve(); };
        v.addEventListener('seeked', finish);
        try { v.currentTime = time; } catch (e) { finish(); }
        setTimeout(finish, 250);
    });
}

// Trace a rounded-rectangle path (for clipping inline images with a corner
// radius). Kept manual instead of ctx.roundRect for maximum canvas support.
function roundRectPath(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

export async function exportVideo({
    segments,
    visualLines,
    lineSettings,
    charsData,
    imagesData = [],
    mediaItems = [],
    fpsInput,
    scrollBox,
    setProgress,
    onComplete,
    onError,
    videoBgColor,
    videoAlignPercent = 50,
    exportScale = 1,
    fontFamily = 'Inter, sans-serif',
    fontWeight = 500,
    fontSize = 45,
    textTransform = 'none'
}) {
    const fps = isNaN(fpsInput) ? 60 : Math.max(20, Math.min(60, fpsInput));

    // All geometry (charsData, imagesData, scrollBox) is measured in a
    // 1080x1920 logical space. exportScale renders that same space onto a
    // larger canvas (2 = real 2160x3840): vectors and text re-rasterize at
    // full output resolution.
    const OUT_W = 1080 * exportScale;
    const OUT_H = 1920 * exportScale;

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
            video: { codec: 'avc', width: OUT_W, height: OUT_H },
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

        // avc1.640034 = H.264 High profile, level 5.2 — covers 2160x3840 @ 60fps.
        const videoConfigBase = {
            codec: 'avc1.640034',
            width: OUT_W,
            height: OUT_H,
            bitrate: exportScale >= 2 ? 40_000_000 : 10_000_000,
            framerate: fps
        };
        let videoConfig = { ...videoConfigBase, hardwareAcceleration: 'prefer-software' };
        try {
            const support = await VideoEncoder.isConfigSupported(videoConfig);
            if (!support.supported) {
                videoConfig = { ...videoConfigBase, hardwareAcceleration: 'no-preference' };
                const fallback = await VideoEncoder.isConfigSupported(videoConfig);
                if (!fallback.supported) {
                    throw new Error(`This browser cannot encode ${OUT_W}x${OUT_H} video`);
                }
            }
        } catch (e) {
            if (e.message && e.message.includes('cannot encode')) throw e;
            // isConfigSupported itself unavailable — proceed with the base config
        }
        videoEncoder.configure(videoConfig);

        const offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = OUT_W;
        offscreenCanvas.height = OUT_H;
        const ctx = offscreenCanvas.getContext('2d', { alpha: false, willReadFrequently: true });
        // Draw in the 1080x1920 logical space; the transform upscales losslessly.
        ctx.scale(exportScale, exportScale);
        // Char positions come from DOM measurement at `fontSize`; the canvas
        // rasterizer runs slightly wide, hence the 43.5/45 correction factor.
        ctx.font = `${fontWeight} ${(fontSize * (43.5 / 45)).toFixed(2)}px ${fontFamily}`;
        ctx.textBaseline = 'top';
        // shadowBlur is in device pixels (unaffected by the transform)
        const SHADOW_BLUR = 2 * exportScale;
        // text-transform is CSS-only; textContent stays raw, so apply it here.
        const transformChar = textTransform === 'uppercase' ? (t) => t.toUpperCase()
            : textTransform === 'lowercase' ? (t) => t.toLowerCase()
            : (t) => t;

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

        // Preload big scene images
        const preloadedMediaImages = {};
        const preloadedMediaVideos = {};
        for (let item of mediaItems) {
            if (item.type === 'video') {
                if (!preloadedMediaVideos[item.src]) {
                    const v = document.createElement('video');
                    v.src = item.src;
                    v.muted = true;
                    v.playsInline = true;
                    v.preload = 'auto';
                    await new Promise((resolve) => {
                        let done = false;
                        const ok = () => { if (done) return; done = true; resolve(); };
                        v.onloadeddata = ok;   // first frame decoded → safe to seek/draw
                        v.onerror = ok;
                        setTimeout(ok, 5000);
                    });
                    preloadedMediaVideos[item.src] = v;
                }
            } else if (!preloadedMediaImages[item.src]) {
                const img = new Image();
                img.src = item.src;
                await new Promise((resolve) => {
                    img.onload = resolve;
                    img.onerror = resolve;
                });
                preloadedMediaImages[item.src] = img;
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

            // Caption + big-image geometry for this frame — the SAME function the
            // live preview uses (getMediaFrameGeometry), so the animated shrink,
            // caption re-centering, and image reveal match the editor exactly.
            const media = getMediaFrameGeometry(mediaItems, currentTimeMs / 1000, fontSize, videoAlignPercent);
            const bandTop = media.captionCenterY - media.captionHeight / 2;
            const bandH = media.captionHeight;

            // baseY is captured relative to the caption's rest CENTER (the track is
            // CSS-anchored at the scroll-container's center), so we only pull the
            // active line to that center (-lineCenter), then add the media shift
            // that slides the caption into the centered [image|gap|caption] group.
            const activeLineCenter = activeLineSpans[0].offsetTop + activeLineSpans[0].offsetHeight / 2;
            const targetTranslation = -activeLineCenter;
            let prevTranslation = targetTranslation;
            if (activeIdx > 0 && timeInLineMs < 600) {
                const prevSpans = visualLines[activeIdx - 1];
                prevTranslation = -(prevSpans[0].offsetTop + prevSpans[0].offsetHeight / 2);
            }
            let trackProgress = Math.min(timeInLineMs / 600, 1.0);
            trackProgress = 1 - Math.pow(1 - trackProgress, 4);
            const currentTranslation = prevTranslation + (targetTranslation - prevTranslation) * trackProgress + media.captionShift;

            let colorProgress = Math.min(timeInLineMs / 100, 1.0);

            ctx.fillStyle = videoBgColor || '#050505';
            ctx.fillRect(0, 0, 1080, 1920);

            // Draw the big scene image below the caption. Mirrors Preview.jsx: the
            // image is full-height and vertically centered inside a growing window
            // (clipTop..clipTop+clipHeight), so it reveals middle-out as it fades in.
            if (media.item && media.image && media.image.clipHeight > 0) {
                const isVideo = media.item.type === 'video';
                const el = isVideo ? preloadedMediaVideos[media.item.src] : preloadedMediaImages[media.item.src];
                const natW = isVideo ? (el && el.videoWidth) : (el && el.width);
                const natH = isVideo ? (el && el.videoHeight) : (el && el.height);
                if (el && natW) {
                    // For video, seek to the frame at this instant (freeze on the last
                    // frame if the block outlasts the clip) before drawing.
                    if (isVideo) {
                        const vidDur = media.item.videoDuration || el.duration || 0;
                        const rel = (currentTimeMs / 1000) - media.item.start;
                        const vt = vidDur > 0 ? clamp(rel, 0, vidDur - 0.03) : Math.max(0, rel);
                        await seekVideoTo(el, vt);
                    }
                    const { left, width, fullHeight, clipTop, clipHeight, centerY, opacity } = media.image;
                    // Apply the item's pan/zoom keyframes at this instant on top of
                    // its base crop (Ken Burns inside the fixed container).
                    const view = sampleKeyframes(media.item.keyframes, mediaLocalProgress(media.item, currentTimeMs / 1000));
                    const { sx, sy, sw, sh } = composeCropView(natW, natH, media.item.crop, view);
                    const radius = media.item.borderRadius ?? MEDIA_IMAGE_RADIUS;
                    ctx.save();
                    ctx.globalAlpha = opacity;
                    // Clip to the revealed window, then draw the full-height cropped
                    // media centered in it.
                    roundRectPath(ctx, left, clipTop, width, clipHeight, Math.min(radius, clipHeight / 2, width / 2));
                    ctx.clip();
                    ctx.drawImage(el, sx, sy, sw, sh, left, centerY - fullHeight / 2, width, fullHeight);
                    ctx.restore();
                }
            }

            // Clip all caption text + inline images to the (animating) caption band
            // so nothing spills over the big image above it — the band's soft edges
            // are handled by the gradient overlay drawn after.
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, bandTop, 1080, bandH);
            ctx.clip();

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

            // Pre-calculate text shifts for collapsed components. Whether an image
            // collapses depends on direction: its "after" behavior once its line has
            // played (line in the past), its "before" behavior beforehand.
            const lineShifts = {};
            for (let imgD of imagesData) {
                const li = imgD.lineIdx;
                let collapsesHere;
                if (li === activeIdx) collapsesHere = imgD.beforeBehavior === 'collapse'; // expanding from before
                else if (li === activeIdx - 1) collapsesHere = imgD.afterBehavior === 'collapse'; // collapsing after
                else if (li < activeIdx) collapsesHere = imgD.afterBehavior === 'collapse'; // past
                else collapsesHere = imgD.beforeBehavior === 'collapse'; // future
                if (!collapsesHere) continue;

                if (!lineShifts[li]) lineShifts[li] = [];
                const targetFontSize = lineSettings[li]?.fontSize || 45;
                const fullShift = imgD.width + (0.25 * targetFontSize);
                let shiftAmount = 0;

                if (li === activeIdx) {
                    // Expanding: from fullShift to 0 over 250ms (matches CSS 0.25s ease-out)
                    const p = Math.min(timeInLineMs / 250, 1.0);
                    const easeP = 1 - Math.pow(1 - p, 3); // ease-out
                    shiftAmount = fullShift * (1 - easeP);
                } else if (li === activeIdx - 1) {
                    // Collapsing: from 0 to fullShift over 300ms (matches CSS 0.3s ease-in-out)
                    const p = Math.min(timeInLineMs / 300, 1.0);
                    const easeP = cubicEase(p);
                    shiftAmount = fullShift * easeP;
                } else {
                    // Fully collapsed
                    shiftAmount = fullShift;
                }

                if (shiftAmount > 0) {
                    lineShifts[li].push({ baseX: imgD.baseX, shift: shiftAmount });
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

                    if (colorProgress > 0) { ctx.shadowColor = charColor; ctx.shadowBlur = SHADOW_BLUR; }
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
                ctx.fillText(transformChar(c.text), c.baseX + charShift, c.baseY + currentTranslation);
            }

            // Draw Images
            for (let imgD of imagesData) {
                const li = imgD.lineIdx;
                const isImgActive = (li === activeIdx);
                // Behavior for this exact moment, chosen by direction: "after" once
                // its line has played, "before" beforehand.
                const beh = isImgActive ? 'active' : (li < activeIdx ? imgD.afterBehavior : imgD.beforeBehavior);
                const isImgCollapsing = (li === activeIdx - 1 && imgD.afterBehavior === 'collapse' && timeInLineMs < 300);
                // Draw when active, mid-collapse, or resting visibly (dim / keep-visible).
                // 'hidden' keeps its space but is invisible; collapsed is invisible too.
                const shouldRender = isImgActive || isImgCollapsing || beh === 'dim' || beh === 'visible';

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

                        if (lineShifts[li]) {
                            for (let collapse of lineShifts[li]) {
                                if (imgD.baseX > collapse.baseX) {
                                    translateX -= collapse.shift;
                                }
                            }
                        }

                        if (!isImgActive) {
                            if (isImgCollapsing) {
                                // Collapsing after its line: matches CSS 0.3s cubic-bezier(0.4,0,0.2,1)
                                const p = Math.min(timeInLineMs / 300, 1.0);
                                const easeP = cubicEase(p);
                                currentLayoutWidth = imgD.width * (1 - easeP);
                                scale = 1 - easeP; // visual scale matches width shrink
                                opacity = 1 - easeP;
                                rotation = 0;
                            } else if (beh === 'dim') {
                                scale = 0.8;
                                rotation = 0;
                                opacity = 0.5;
                                ctx.filter = 'grayscale(100%)';
                            } else {
                                // 'visible' — resting at full size
                                scale = 1;
                                rotation = 0;
                                opacity = 1;
                            }
                        } else {
                            if (imgD.beforeBehavior === 'collapse' && timeInLineMs < 250) {
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

                        // Static tilt is added on top of any animation rotation.
                        const totalRotation = rotation + (imgD.rotation || 0);

                        ctx.translate(imgD.baseX + translateX + (currentLayoutWidth / 2), imgD.baseY + currentTranslation + translateY + (imgD.height / 2));
                        if (totalRotation !== 0) ctx.rotate(totalRotation * Math.PI / 180);
                        if (scale !== 1) ctx.scale(scale, scale);

                        // Rounded corners: clip to a rounded rect before drawing.
                        if (imgD.borderRadius > 0) {
                            roundRectPath(ctx, -imgD.width / 2, -imgD.height / 2, imgD.width, imgD.height, imgD.borderRadius);
                            ctx.clip();
                        }
                        ctx.drawImage(img, -imgD.width / 2, -imgD.height / 2, imgD.width, imgD.height);
                        ctx.restore();
                    }
                }
            }

            // Close the caption-band clip opened before the text/inline-image loops.
            ctx.restore();

            ctx.shadowBlur = 0;
            const grad = ctx.createLinearGradient(0, bandTop, 0, bandTop + bandH);
            grad.addColorStop(0, bgRgba); grad.addColorStop(0.15, bgRgba75);
            grad.addColorStop(0.40, bgRgba0); grad.addColorStop(0.60, bgRgba0);
            grad.addColorStop(0.85, bgRgba75); grad.addColorStop(1.0, bgRgba);

            ctx.fillStyle = grad;
            ctx.fillRect(0, bandTop, 1080, bandH);

            // Fill solid background outside the caption band. When a big image is on
            // screen it sits BELOW the band, so erase above the band, the gap between
            // band and image, and below the image — never over the image itself.
            ctx.fillStyle = videoBgColor || '#050505';
            if (media.item && media.image && media.image.clipHeight > 0) {
                const imgTop = media.image.clipTop;
                const imgBottom = media.image.clipTop + media.image.clipHeight;
                ctx.fillRect(0, 0, 1080, bandTop);
                if (imgTop > bandTop + bandH) ctx.fillRect(0, bandTop + bandH, 1080, imgTop - (bandTop + bandH));
                ctx.fillRect(0, imgBottom, 1080, 1920 - imgBottom);
            } else {
                ctx.fillRect(0, 0, 1080, bandTop);
                ctx.fillRect(0, bandTop + bandH, 1080, 1920 - (bandTop + bandH));
            }

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

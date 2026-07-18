// Shared geometry/timing for "big media" (full-width scene photos/videos that
// sit with the captions). Both the live preview (CSS + a per-frame rAF loop) and
// the export engine (canvas, frame-by-frame) use this file so they agree on:
//   - how compact the caption block gets while media is showing
//   - the on-screen box (width/height) of each media item
//   - which part of the source is visible (the "frame" + pan/zoom keyframes)
//   - how items reveal / hide and stack over time
// so this file is the single source of truth for that math.

export const CAPTION_EXPANDED_EM = 10.15;
export const CAPTION_LINE_HEIGHT_EM = 1.45;
export const CAPTION_COMPACT_EM = 3 * CAPTION_LINE_HEIGHT_EM; // 4.35

// How long the reveal/hide animation takes.
export const MEDIA_TRANSITION_MS = 500;
// Media items may now sit flush against each other (0 gap); the timeline provides
// magnetic snapping to make touching edges easy. Kept exported (== 0) so callers
// that referenced it still work.
export const MEDIA_MIN_GAP_SEC = 0;
export const MEDIA_EASE_CSS = 'cubic-bezier(0.4, 0, 0.2, 1)';

// The media column's max width (equal 54px margins each side).
export const TEXT_COLUMN_PAD_LEFT = 54;
export const TEXT_COLUMN_PAD_RIGHT = 157;

export const MEDIA_IMAGE_RADIUS = 20;
export const MEDIA_IMAGE_GAP = 28;
export const SCREEN_H = 1920;
export const MEDIA_IMAGE_WIDTH = 1080 - TEXT_COLUMN_PAD_LEFT * 2; // 972 (max width)
// A media box never gets taller than this, so a tall/portrait frame doesn't
// overfill the screen — it becomes narrower instead of taller.
export const MEDIA_MAX_HEIGHT = Math.round(SCREEN_H * 0.8); // 1536

export const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

// Exact cubic-bezier(0.4, 0, 0.2, 1) evaluator — the SAME curve the preview's CSS
// transitions use, so the export's per-frame progress matches precisely.
const makeCubicBezier = (x1, y1, x2, y2) => {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sampleX = (t) => ((ax * t + bx) * t + cx) * t;
    const sampleY = (t) => ((ay * t + by) * t + cy) * t;
    const sampleDX = (t) => (3 * ax * t + 2 * bx) * t + cx;
    return (x) => {
        if (x <= 0) return 0;
        if (x >= 1) return 1;
        let t = x;
        for (let i = 0; i < 8; i++) {
            const xErr = sampleX(t) - x;
            if (Math.abs(xErr) < 1e-6) return sampleY(t);
            const d = sampleDX(t);
            if (Math.abs(d) < 1e-6) break;
            t -= xErr / d;
        }
        let lo = 0, hi = 1;
        t = x;
        for (let i = 0; i < 20; i++) {
            const xe = sampleX(t);
            if (Math.abs(xe - x) < 1e-6) break;
            if (x > xe) lo = t; else hi = t;
            t = (lo + hi) / 2;
        }
        return sampleY(t);
    };
};
export const mediaEase = makeCubicBezier(0.4, 0, 0.2, 1);

export const isMediaActiveAt = (item, timeSec) =>
    timeSec >= item.start && timeSec < item.start + item.duration;

export const getActiveMediaItem = (mediaItems, timeSec) =>
    mediaItems.find(m => isMediaActiveAt(m, timeSec)) || null;

// Resolves a candidate [start, start+duration] window against every other media
// item so none overlap (they may touch). Nudges toward whichever side is closer
// to the desired start. `id` is the item being moved/resized (excluded) or null
// for a brand-new item.
export const clampMediaWindow = (mediaItems, id, desiredStart, duration, totalTime) => {
    duration = Math.max(0.2, duration);
    const others = mediaItems.filter(m => m.id !== id).sort((a, b) => a.start - b.start);
    let s = Math.max(0, desiredStart);

    for (let pass = 0; pass < others.length + 1; pass++) {
        let moved = false;
        for (const o of others) {
            const oStart = o.start - MEDIA_MIN_GAP_SEC;
            const oEnd = o.start + o.duration + MEDIA_MIN_GAP_SEC;
            if (s < oEnd && s + duration > oStart) {
                const distBefore = Math.abs(desiredStart - (oStart - duration));
                const distAfter = Math.abs(desiredStart - oEnd);
                s = distBefore <= distAfter ? Math.max(0, oStart - duration) : oEnd;
                moved = true;
            }
        }
        if (!moved) break;
    }

    if (totalTime != null && s + duration > totalTime) {
        s = Math.max(0, totalTime - duration);
    }
    return { start: s, duration };
};

// ---------------------------------------------------------------------------
// Crop = FRAME. The popup crop only sets the frame's aspect ratio + default
// position; it is NOT a hard clip. Keyframe pan/zoom can move the frame across
// the WHOLE source (see composeCropView / views below).
// ---------------------------------------------------------------------------
const DEFAULT_CROP = { x: 0, y: 0, w: 1, h: 1 };
export const normalizeCrop = (crop) => {
    const c = crop || DEFAULT_CROP;
    return {
        x: clamp(c.x ?? 0, 0, 1),
        y: clamp(c.y ?? 0, 0, 1),
        w: clamp(c.w ?? 1, 0.02, 1),
        h: clamp(c.h ?? 1, 0.02, 1)
    };
};

// Source rectangle (natural pixels) the crop selects — used for thumbnails.
export const cropSourceRect = (natW, natH, crop) => {
    const c = normalizeCrop(crop);
    return { sx: c.x * natW, sy: c.y * natH, sw: c.w * natW, sh: c.h * natH };
};

// The drawn box (width,height) for a crop's aspect, capped at MEDIA_MAX_HEIGHT so
// a tall frame becomes narrower rather than overfilling the screen.
export const cropOutputBox = (natW, natH, crop) => {
    if (!natW || !natH) return { width: MEDIA_IMAGE_WIDTH, height: 760 };
    const { sw, sh } = cropSourceRect(natW, natH, crop);
    if (sw <= 0 || sh <= 0) return { width: MEDIA_IMAGE_WIDTH, height: 760 };
    const naturalH = MEDIA_IMAGE_WIDTH * (sh / sw);
    if (naturalH <= MEDIA_MAX_HEIGHT) return { width: MEDIA_IMAGE_WIDTH, height: Math.round(naturalH) };
    return { width: Math.round(MEDIA_IMAGE_WIDTH * (MEDIA_MAX_HEIGHT / naturalH)), height: MEDIA_MAX_HEIGHT };
};
// Back-compat helper (height only).
export const cropOutputHeight = (natW, natH, crop, fallback = 760) => {
    if (!natW || !natH) return fallback;
    return cropOutputBox(natW, natH, crop).height;
};

export const newMediaItemDefaults = (type = 'image') => ({
    type,                              // 'image' | 'video'
    width: MEDIA_IMAGE_WIDTH,          // box width (derived once media loads)
    height: 760,                       // box height (derived once media loads)
    crop: { ...DEFAULT_CROP },         // frame: aspect + default position
    borderRadius: 24,
    keyframes: []                      // pan/zoom motion across the source (empty = static frame)
});

// ---------------------------------------------------------------------------
// Views (pan/zoom keyframes). A "view" is a viewport over the FULL source with
// the crop frame's aspect:  { scale, cx, cy }
//   scale — 1 = the crop-sized window; >1 zooms in; can go below 1 (down to the
//           point the window fills the source) to reveal more than the crop.
//   cx,cy — the window CENTER in source-normalized [0..1] (pans the whole image).
// The default view (no keyframes) equals the crop rectangle exactly.
// ---------------------------------------------------------------------------
export const MEDIA_MAX_ZOOM = 4;

export const defaultView = (crop) => {
    const c = normalizeCrop(crop);
    return { scale: 1, cx: c.x + c.w / 2, cy: c.y + c.h / 2 };
};

export const minViewScale = (crop) => {
    const c = normalizeCrop(crop);
    return Math.max(c.w, c.h); // window (c.w/scale × c.h/scale) must fit in [0,1]
};

export const clampView = (view, crop) => {
    const c = normalizeCrop(crop);
    const scale = clamp(view?.scale ?? 1, minViewScale(crop), MEDIA_MAX_ZOOM);
    const halfW = c.w / (2 * scale);
    const halfH = c.h / (2 * scale);
    const def = defaultView(crop);
    return {
        scale,
        cx: clamp(view?.cx ?? def.cx, halfW, 1 - halfW),
        cy: clamp(view?.cy ?? def.cy, halfH, 1 - halfH)
    };
};

const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (t) => t * t * (3 - 2 * t);

// Interpolate the view at progress p (0..1 across the item's window) from the
// keyframe list. 0 keyframes → the default frame; before first / after last holds.
export const sampleKeyframes = (keyframes, p, crop) => {
    if (!keyframes || keyframes.length === 0) return defaultView(crop);
    const kfs = [...keyframes].sort((a, b) => a.t - b.t);
    if (p <= kfs[0].t) return clampView(kfs[0], crop);
    const last = kfs[kfs.length - 1];
    if (p >= last.t) return clampView(last, crop);
    for (let i = 0; i < kfs.length - 1; i++) {
        const a = kfs[i], b = kfs[i + 1];
        if (p >= a.t && p <= b.t) {
            const span = b.t - a.t;
            const local = span > 0 ? smoothstep((p - a.t) / span) : 0;
            const va = clampView(a, crop), vb = clampView(b, crop);
            return {
                scale: lerp(va.scale, vb.scale, local),
                cx: lerp(va.cx, vb.cx, local),
                cy: lerp(va.cy, vb.cy, local)
            };
        }
    }
    return clampView(last, crop);
};

// The effective source rectangle (natural pixels) for a view over the full
// source. With the default view this equals cropSourceRect.
export const composeCropView = (natW, natH, crop, view) => {
    const c = normalizeCrop(crop);
    const v = clampView(view, crop);
    const windowW = c.w / v.scale;
    const windowH = c.h / v.scale;
    return {
        sx: (v.cx - windowW / 2) * natW,
        sy: (v.cy - windowH / 2) * natH,
        sw: windowW * natW,
        sh: windowH * natH
    };
};

// Position/size (px) for a raw full-source <img>/<video> inside a boxW×boxH,
// overflow-hidden window so the given view is shown. The editor preview sets
// these imperatively each frame; matches composeCropView exactly.
export const mediaElementBox = (crop, view, boxW, boxH) => {
    const c = normalizeCrop(crop);
    const v = clampView(view, crop);
    const windowW = c.w / v.scale;
    const windowH = c.h / v.scale;
    const elW = boxW / windowW;
    const elH = boxH / windowH;
    return {
        width: elW,
        height: elH,
        left: -(v.cx - windowW / 2) * elW,
        top: -(v.cy - windowH / 2) * elH
    };
};

export const mediaLocalProgress = (item, timeSec) => {
    if (!item || item.duration <= 0) return 0;
    return clamp((timeSec - item.start) / item.duration, 0, 1);
};

export const newKeyframe = (t = 0, view, crop) => ({
    id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    t: clamp(t, 0, 1),
    ...clampView(view, crop)
});

export const keyframeAt = (keyframes, t, tEps = 0.01) => {
    if (!keyframes || !keyframes.length) return null;
    let best = null, bestD = tEps;
    for (const k of keyframes) {
        const d = Math.abs(k.t - t);
        if (d <= bestD) { best = k; bestD = d; }
    }
    return best;
};

export const normalizeKeyframe = (k, crop) => ({ id: k.id, t: clamp(k.t ?? 0, 0, 1), ...clampView(k, crop) });

// ---------------------------------------------------------------------------
// Timeline reveal model. Each item fades in over its first TRANSITION and out
// over the TRANSITION after its end (matching the preview's CSS transitions).
// Adjacent items therefore cross-fade; the caption stays compact across a whole
// run of touching media (its target follows the UNION of windows).
// ---------------------------------------------------------------------------
const T_SEC = MEDIA_TRANSITION_MS / 1000;

const itemReveal = (item, timeSec) => {
    const s = item.start, e = item.start + item.duration;
    if (timeSec < s || timeSec >= e + T_SEC) return 0;
    let r = Math.min((timeSec - s) / T_SEC, 1);       // fade in
    if (timeSec > e) r = Math.min(r, 1 - (timeSec - e) / T_SEC); // fade out
    return mediaEase(clamp(r, 0, 1));
};

const captionCompactAt = (mediaItems, timeSec) => {
    const iv = mediaItems.map(m => [m.start, m.start + m.duration]).sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const [s, e] of iv) {
        const last = merged[merged.length - 1];
        if (last && s <= last[1] + 1e-6) last[1] = Math.max(last[1], e);
        else merged.push([s, e]);
    }
    let best = 0;
    for (const [s, e] of merged) {
        if (timeSec < s || timeSec >= e + T_SEC) continue;
        let r = Math.min((timeSec - s) / T_SEC, 1);
        if (timeSec > e) r = Math.min(r, 1 - (timeSec - e) / T_SEC);
        best = Math.max(best, clamp(r, 0, 1));
    }
    return mediaEase(best);
};

// Kept for the live preview, which only needs the caption height at a 0/1 target
// (CSS smooths it). Single-item; layout of the media blocks is done in CSS.
export const getMediaGeometry = (item, progress, fontSize, videoAlignPercent = 50) => {
    const expandedH = CAPTION_EXPANDED_EM * fontSize;
    const compactH = CAPTION_COMPACT_EM * fontSize;
    const restCenter = (videoAlignPercent / 100) * SCREEN_H;
    const captionHeight = expandedH + (compactH - expandedH) * progress;
    return { captionHeight, captionCenterY: restCenter, captionShift: 0, image: null };
};

// Full per-frame layout for the export engine: caption band + a stack of the
// media blocks currently revealed (0, 1, or 2 during a cross-fade), matching the
// preview's centered flex column.
export const getMediaLayout = (mediaItems, timeSec, fontSize, videoAlignPercent = 50) => {
    const expandedH = CAPTION_EXPANDED_EM * fontSize;
    const compactH = CAPTION_COMPACT_EM * fontSize;
    const restCenter = (videoAlignPercent / 100) * SCREEN_H;
    const compact = captionCompactAt(mediaItems, timeSec);
    const captionHeight = expandedH + (compactH - expandedH) * compact;

    const shown = mediaItems
        .map(m => ({ item: m, reveal: itemReveal(m, timeSec) }))
        .filter(s => s.reveal > 0.0005)
        .sort((a, b) => a.item.start - b.item.start);

    let stackH = 0;
    for (const s of shown) stackH += s.reveal * (MEDIA_IMAGE_GAP + s.item.height);

    const groupH = captionHeight + stackH;
    const groupTop = restCenter - groupH / 2;
    const captionCenterY = groupTop + captionHeight / 2;
    const captionShift = captionCenterY - restCenter;

    let cursor = groupTop + captionHeight;
    const images = shown.map(s => {
        const w = s.item.width || MEDIA_IMAGE_WIDTH;
        const gap = MEDIA_IMAGE_GAP * s.reveal;
        const clipHeight = s.item.height * s.reveal;
        const clipTop = cursor + gap;
        cursor = clipTop + clipHeight;
        return {
            item: s.item,
            left: (1080 - w) / 2,
            width: w,
            fullHeight: s.item.height,
            clipTop,
            clipHeight,
            centerY: clipTop + clipHeight / 2,
            opacity: s.reveal
        };
    });

    return { captionHeight, captionCenterY, captionShift, images };
};

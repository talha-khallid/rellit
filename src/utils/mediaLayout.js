// Shared geometry/timing for "big images" (full-width scene photos that sit
// behind the captions). Both the live preview (CSS-driven) and the export
// engine (canvas, driven frame-by-frame in JS) need to agree on:
//   - how compact the caption block gets while a big image is showing
//   - exactly which pixels of a cropped photo are visible
//   - where one image's timeline slot ends and the next may begin
// so this file is the single source of truth for that math.

// The caption scroll-window's height, expressed in `em` (relative to the
// caption's own font-size) so it scales with font size like the rest of the
// caption block. EXPANDED matches the original always-on height (~7 lines:
// 3 above the highlight, the highlight, 3 below). COMPACT shows exactly 3
// lines (1 above, the highlight, 1 below), per the "reduce to one line top
// and bottom" requirement — 3 * the 1.45 line-height used in Preview/export.
export const CAPTION_EXPANDED_EM = 10.15;
export const CAPTION_LINE_HEIGHT_EM = 1.45;
export const CAPTION_COMPACT_EM = 3 * CAPTION_LINE_HEIGHT_EM; // 4.35

// How long the reveal/hide animation takes. Also doubles as the minimum gap
// enforced between two big images on the timeline, so at most one image is
// ever mid-transition at a time — this keeps the export engine's per-frame
// math (which handles one active item at a time) always well-defined.
export const MEDIA_TRANSITION_MS = 500;
export const MEDIA_MIN_GAP_SEC = MEDIA_TRANSITION_MS / 1000;
export const MEDIA_EASE_CSS = 'cubic-bezier(0.4, 0, 0.2, 1)';

// The big image is always exactly as wide as the caption text column, so it
// reuses the same left/right padding used for captions in Preview.jsx.
export const TEXT_COLUMN_PAD_LEFT = 54;
export const TEXT_COLUMN_PAD_RIGHT = 157;

// Corner radius applied to every big image, in both the live preview and export.
export const MEDIA_IMAGE_RADIUS = 20;

// Fixed margin (px, 1080x1920 logical space) between the image and the caption
// block within the centered container.
export const MEDIA_IMAGE_GAP = 28;

// Screen height in the logical 1080x1920 space.
export const SCREEN_H = 1920;

export const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

// Exact cubic-bezier(0.4, 0, 0.2, 1) evaluator — the SAME curve the preview's
// CSS transitions use — so the export's per-frame progress matches the browser
// animation precisely (not just approximately). Solves x=t via Newton's method,
// then samples y.
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

// For the export engine: which item (if any) is currently animating in,
// fully shown, or animating out at timeSec, and how far into that motion it
// is (0 = fully hidden/collapsed, 1 = fully shown/expanded). Items are kept
// MEDIA_MIN_GAP_SEC apart (see clampMediaWindow), so at most one item is ever
// "relevant" at a given instant.
export const getMediaFrame = (mediaItems, timeSec) => {
    for (const item of mediaItems) {
        const end = item.start + item.duration;
        const exitEnd = end + MEDIA_MIN_GAP_SEC;
        if (timeSec < item.start || timeSec >= exitEnd) continue;
        const rawProgress = timeSec <= end
            ? Math.min((timeSec - item.start) * 1000 / MEDIA_TRANSITION_MS, 1)
            : 1 - Math.min((timeSec - end) * 1000 / MEDIA_TRANSITION_MS, 1);
        return { item, progress: mediaEase(rawProgress) };
    }
    return null;
};

// Resolves a candidate [start, start+duration] window against every other
// media item so none ever overlap (and stay MEDIA_MIN_GAP_SEC apart). Nudges
// toward whichever side is closer to the originally desired start. `id` is
// the item being moved/resized (excluded from the collision set) or null
// when placing a brand-new item.
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

// The image column width (equal 54px margins each side) that every big image
// is drawn at. Its height is derived from the crop's aspect ratio.
export const MEDIA_IMAGE_WIDTH = 1080 - TEXT_COLUMN_PAD_LEFT * 2; // 972

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

// Source rectangle (in natural pixels) of the image that the crop selects —
// used identically by CroppedImage (browser) and exportEngine (canvas).
export const cropSourceRect = (natW, natH, crop) => {
    const c = normalizeCrop(crop);
    return { sx: c.x * natW, sy: c.y * natH, sw: c.w * natW, sh: c.h * natH };
};

// The image's drawn height at MEDIA_IMAGE_WIDTH so the crop keeps its aspect
// ratio (no stretching). Falls back to the previous height if size unknown.
export const cropOutputHeight = (natW, natH, crop, fallback = 760) => {
    if (!natW || !natH) return fallback;
    const { sw, sh } = cropSourceRect(natW, natH, crop);
    if (sw <= 0) return fallback;
    return Math.round(MEDIA_IMAGE_WIDTH * (sh / sw));
};

export const newMediaItemDefaults = () => ({
    height: 760,                       // derived from the crop once the image loads
    crop: { ...DEFAULT_CROP },         // normalized [0..1] source rectangle
    borderRadius: 24,                  // rounded corners, adjustable in the editor
    keyframes: []                      // pan/zoom motion inside the container (empty = static)
});

// --- Keyframe pan/zoom ("motion") inside the fixed image container ----------
// A big image can carry an ordered list of keyframes describing a viewport that
// pans/zooms INSIDE its container (a Ken Burns effect) WITHOUT changing the
// container's on-screen size. A keyframe's view is { scale, cx, cy }:
//   scale ≥ 1  — zoom factor (1 = the whole crop, 2 = zoomed 2x)
//   cx, cy     — the focal center within the crop, in [0..1]
// and `t` is its position in the image's window, a 0..1 fraction of the item's
// duration (robust to timeline resizes). No keyframes → the static full crop,
// so existing images are unchanged.
export const MEDIA_MAX_ZOOM = 4;
export const DEFAULT_VIEW = { scale: 1, cx: 0.5, cy: 0.5 };

export const clampView = (view) => {
    const scale = clamp(view?.scale ?? 1, 1, MEDIA_MAX_ZOOM);
    const half = 0.5 / scale;                 // half the viewport, in crop-space
    return {
        scale,
        cx: clamp(view?.cx ?? 0.5, half, 1 - half),
        cy: clamp(view?.cy ?? 0.5, half, 1 - half)
    };
};

const lerp = (a, b, t) => a + (b - a) * t;
// Smooth ease-in-out between keyframes so pans/zooms glide instead of snapping.
const smoothstep = (t) => t * t * (3 - 2 * t);

// Interpolate the view at progress p (0..1 across the item's window) from the
// keyframe list. 0 keyframes → default (no motion); 1 → that view, constant.
// Before the first / after the last keyframe the view holds steady.
export const sampleKeyframes = (keyframes, p) => {
    if (!keyframes || keyframes.length === 0) return { ...DEFAULT_VIEW };
    const kfs = [...keyframes].sort((a, b) => a.t - b.t);
    if (p <= kfs[0].t) return clampView(kfs[0]);
    const last = kfs[kfs.length - 1];
    if (p >= last.t) return clampView(last);
    for (let i = 0; i < kfs.length - 1; i++) {
        const a = kfs[i], b = kfs[i + 1];
        if (p >= a.t && p <= b.t) {
            const span = b.t - a.t;
            const local = span > 0 ? smoothstep((p - a.t) / span) : 0;
            const va = clampView(a), vb = clampView(b);
            return {
                scale: lerp(va.scale, vb.scale, local),
                cx: lerp(va.cx, vb.cx, local),
                cy: lerp(va.cy, vb.cy, local)
            };
        }
    }
    return clampView(last);
};

// Compose a keyframe view on top of the base crop → the effective source
// rectangle in natural pixels. With DEFAULT_VIEW this equals cropSourceRect, so
// it is a safe drop-in for the export's drawImage source args.
export const composeCropView = (natW, natH, crop, view) => {
    const base = cropSourceRect(natW, natH, crop);
    const v = clampView(view);
    return {
        sx: base.sx + (v.cx - 0.5 / v.scale) * base.sw,
        sy: base.sy + (v.cy - 0.5 / v.scale) * base.sh,
        sw: base.sw / v.scale,
        sh: base.sh / v.scale
    };
};

// The CSS transform (transform-origin: 0 0) that applies a view to a box-sized,
// already-cropped image element in the live preview — the exact CSS counterpart
// of composeCropView, so the editor preview and the export match.
export const mediaViewTransform = (view, boxW, boxH) => {
    const v = clampView(view);
    const tx = boxW / 2 - v.scale * v.cx * boxW;
    const ty = boxH / 2 - v.scale * v.cy * boxH;
    return `translate(${tx}px, ${ty}px) scale(${v.scale})`;
};

// Progress (0..1) through an item's own window at an absolute time.
export const mediaLocalProgress = (item, timeSec) => {
    if (!item || item.duration <= 0) return 0;
    return clamp((timeSec - item.start) / item.duration, 0, 1);
};

export const newKeyframe = (t = 0, view = DEFAULT_VIEW) => ({
    id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    t: clamp(t, 0, 1),
    ...clampView(view)
});

// The single source of truth for the on-screen layout at a given animation
// `progress` (0 = no image / captions at rest, 1 = image fully shown / captions
// compact). It models exactly what a centered CSS flex column does:
//
//     [ caption block (height animates expanded→compact) ]
//     [ gap (0→G) ]
//     [ image block (height animates 0→A, reveals middle-out) ]
//
// the whole group vertically centered at the caption's anchor (videoAlignPercent).
// Because the image reserves real, growing space below the text — never absolute
// space over it — the two can never overlap while animating. The live preview
// literally IS this flex layout; the export engine reproduces these numbers.
export const getMediaGeometry = (item, progress, fontSize, videoAlignPercent = 50) => {
    const expandedH = CAPTION_EXPANDED_EM * fontSize;
    const compactH = CAPTION_COMPACT_EM * fontSize;
    const restCenter = (videoAlignPercent / 100) * SCREEN_H;
    const captionHeight = expandedH + (compactH - expandedH) * progress;

    if (!item) {
        return { captionHeight, captionCenterY: restCenter, captionShift: 0, image: null };
    }

    const A = item.height;
    const gapReserved = MEDIA_IMAGE_GAP * progress;
    const imgReserved = A * progress;               // grows in below the text
    const groupH = captionHeight + gapReserved + imgReserved;
    const groupTop = restCenter - groupH / 2;        // group stays centered
    const captionCenterY = groupTop + captionHeight / 2;
    const captionShift = captionCenterY - restCenter; // caption drifts up as image grows
    const imgBlockTop = groupTop + captionHeight + gapReserved;

    const image = {
        left: TEXT_COLUMN_PAD_LEFT,
        width: 1080 - TEXT_COLUMN_PAD_LEFT * 2,
        fullHeight: A,                       // the image's full drawn height
        clipTop: imgBlockTop,                // visible (revealed) window …
        clipHeight: imgReserved,             // … which grows 0→A
        centerY: imgBlockTop + imgReserved / 2,
        opacity: progress
    };
    return { captionHeight, captionCenterY, captionShift, image };
};

// Per-frame geometry for the export engine (finds the active/animating item).
export const getMediaFrameGeometry = (mediaItems, timeSec, fontSize, videoAlignPercent = 50) => {
    const frame = getMediaFrame(mediaItems, timeSec);
    const item = frame ? frame.item : null;
    const progress = frame ? frame.progress : 0;
    return { ...getMediaGeometry(item, progress, fontSize, videoAlignPercent), item, progress };
};

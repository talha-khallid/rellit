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

// Vertical gap (px, in the 1080x1920 logical space) between the image's
// bottom edge and the compact caption block's top edge.
export const MEDIA_IMAGE_GAP = 24;

export const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

// cubic-bezier(0.4, 0, 0.2, 1) approximation for canvas/export (no native CSS
// easing there), matching the curve used elsewhere in exportEngine.js.
export const mediaEase = (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

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

// Crop/fit math shared by the browser (CroppedImage) and canvas (exportEngine)
// renderers, so a crop set in the editor looks pixel-identical in both.
//
// 'contain': image fully visible, letterboxed — returns the drawn size.
// 'cover': image fills the box; focalX/focalY (0..1) is the point of the
//   ORIGINAL image kept centered in the box, zoom (>=1) narrows the visible
//   source region further. Returns the source rectangle to sample.
export const computeCropGeometry = (natW, natH, boxW, boxH, fit, focalX, focalY, zoom) => {
    if (!natW || !natH || boxW <= 0 || boxH <= 0) return null;

    if (fit === 'contain') {
        const scale = Math.min(boxW / natW, boxH / natH);
        return { mode: 'contain', scale, dw: natW * scale, dh: natH * scale };
    }

    const coverScale = Math.max(boxW / natW, boxH / natH);
    const effScale = coverScale * Math.max(1, zoom || 1);
    const visW = boxW / effScale;
    const visH = boxH / effScale;
    const sx = clamp((focalX ?? 0.5) * natW - visW / 2, 0, Math.max(0, natW - visW));
    const sy = clamp((focalY ?? 0.5) * natH - visH / 2, 0, Math.max(0, natH - visH));
    return { mode: 'cover', effScale, sx, sy, sw: visW, sh: visH };
};

export const newMediaItemDefaults = () => ({
    height: 869, // square by default — box width is always the text column width
    fit: 'cover',
    focalX: 0.5,
    focalY: 0.5,
    zoom: 1,
    // px, in the 1080x1920 logical space. Shifts the image from its default
    // auto-aligned spot (just above the caption block). Positive = down
    // (toward the text), negative = up (away from it).
    offsetY: 0
});

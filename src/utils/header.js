// Header overlays — a title / label pinned near the TOP of the video. Unlike the
// footer (fixed to the bottom), the header is RESPONSIVE to the caption block
// below it: when big media pushes the captions up, the header follows up to keep
// a standard gap above them; if there's no room left it slides up out of frame
// and fades; when the media hides and the captions drop back, it slides+fades
// back down. Rendered by BOTH the live preview (a canvas overlay) and the export
// (per frame) using the SAME draw function here, so they always match.
//
// All geometry is in the 1080x1920 logical space. `bandTop` is the top edge of
// the caption band for this frame (captionCenterY - captionHeight/2), which the
// caller derives from getMediaLayout — the single source of truth both preview
// and export already use.

export const HEADER_W = 1080;
export const HEADER_H = 1920;
export const HEADER_PAD_X = 54;

// The header never rises above this line — its "don't leave the video" ceiling.
export const HEADER_SAFE_TOP = 40;

export const HEADER_TYPES = [
    { id: 'text', label: 'Title / text' }
];

export const newHeaderId = () => `hd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

export const newHeaderItem = (type = 'text') => ({
    id: newHeaderId(), type: 'text', text: 'Your Title',
    color: '#ffffff', fontSize: 46, fontWeight: 700,
    opacity: 1, letterSpacing: 0.3, align: 'center',
    // Resting distance from the top (%) and the standard gap (px) kept above the
    // caption band. `follow` = responsive to the captions (default on).
    topPct: 7, gap: 46, follow: true
});

const clamp01 = (v) => Math.min(1, Math.max(0, v));

// Compute the header's rendered top (1080x1920 space) and its opacity multiplier
// for this frame, given the caption band's top. Exported so callers/tests can
// reason about it, but drawHeaderItem is what actually paints.
export const resolveHeaderPlacement = (item, bandTop) => {
    const H = HEADER_H;
    const fs = item.fontSize || 46;
    const restTop = (item.topPct ?? 7) / 100 * H;
    const h = fs * 1.15;                    // approx full glyph block height
    const gap = item.gap ?? 46;
    const follow = item.follow !== false;

    let top = restTop;
    let alpha = 1;

    if (follow && typeof bandTop === 'number' && isFinite(bandTop)) {
        // Where the header WANTS to be to keep the standard gap above the band —
        // but it only ever moves UP from rest (never below it).
        const desiredTop = Math.min(restTop, bandTop - gap - h);
        if (desiredTop >= HEADER_SAFE_TOP) {
            // Plenty of room: keep the standard gap, stay inside the video.
            top = desiredTop;
        } else {
            // No room: keep sliding up (out of frame) AND fade — fully hidden once
            // the whole header has cleared above the safe ceiling (its bottom passes
            // HEADER_SAFE_TOP), so a truly-squeezed header disappears instead of
            // lingering half-visible at the top.
            top = desiredTop;
            alpha = clamp01((desiredTop - (HEADER_SAFE_TOP - h)) / h);
        }
    }

    return { top, alpha };
};

export const drawHeaderItem = (ctx, item, bandTop, fontFamily = 'Inter, sans-serif') => {
    if (!item || item.type !== 'text') return;
    const W = HEADER_W;
    const fs = item.fontSize || 46;

    const { top, alpha } = resolveHeaderPlacement(item, bandTop);
    const finalAlpha = alpha * (item.opacity ?? 1);
    if (finalAlpha <= 0.001) return;

    ctx.save();
    ctx.globalAlpha = finalAlpha;
    ctx.fillStyle = item.color || '#ffffff';
    ctx.font = `${item.fontWeight || 700} ${fs}px ${fontFamily}`;
    ctx.textBaseline = 'top';
    try { ctx.letterSpacing = `${item.letterSpacing || 0}px`; } catch (e) { /* older canvas */ }
    const align = item.align || 'center';
    ctx.textAlign = align === 'left' ? 'left' : align === 'right' ? 'right' : 'center';
    const x = align === 'left' ? HEADER_PAD_X : align === 'right' ? W - HEADER_PAD_X : W / 2;
    ctx.fillText(item.text || '', x, top);
    try { ctx.letterSpacing = '0px'; } catch (e) { /* ignore */ }
    ctx.restore();
};

// Draw every header element onto a 1080x1920 context. `bandTop` is the caption
// band's top for this frame; `fontFamily` lets the title match the video font.
export const drawHeader = (ctx, headerItems, bandTop, fontFamily = 'Inter, sans-serif') => {
    if (!headerItems || !headerItems.length) return;
    for (const item of headerItems) drawHeaderItem(ctx, item, bandTop, fontFamily);
};

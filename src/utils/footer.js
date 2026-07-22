// Footer overlays — decorative/functional elements pinned near the bottom of the
// video (a playback progress bar, a handle/label, …). Rendered by BOTH the live
// preview (a canvas overlay on the phone screen) and the export (per frame), using
// the SAME draw function here, so they always match. All geometry is in the
// 1080x1920 logical space; `progress` is overall playback completion (0..1).

import { hexToRgb } from './colorUtils';

export const FOOTER_W = 1080;
export const FOOTER_H = 1920;
export const FOOTER_PAD_X = 54;

export const FOOTER_TYPES = [
    { id: 'progress', label: 'Progress bar' },
    { id: 'text', label: 'Text / handle' }
];

export const FOOTER_PROGRESS_STYLES = [
    { id: 'pill', label: 'Pill' },
    { id: 'line', label: 'Line' },
    { id: 'knob', label: 'Knob' },
    { id: 'segments', label: 'Segments' }
];

export const newFooterId = () => `ft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

export const newFooterItem = (type = 'progress') => {
    if (type === 'text') {
        return {
            id: newFooterId(), type: 'text', text: '@yourhandle',
            color: '#ffffff', fontSize: 34, fontWeight: 600,
            opacity: 0.85, letterSpacing: 0.5, align: 'center', bottomPct: 3.5
        };
    }
    return {
        id: newFooterId(), type: 'progress', barStyle: 'pill',
        color: '#ffffff', trackOpacity: 0.22,
        thickness: 8, widthPct: 86, bottomPct: 5, segments: 5
    };
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const rgba = (hex, a) => { const c = hexToRgb(hex || '#ffffff'); return `rgba(${c.r}, ${c.g}, ${c.b}, ${a})`; };

const roundRect = (ctx, x, y, w, h, r) => {
    if (w <= 0) return;
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
};

export const drawFooterItem = (ctx, item, progress) => {
    if (!item) return;
    const p = clamp01(progress);
    const W = FOOTER_W, H = FOOTER_H;

    if (item.type === 'text') {
        ctx.save();
        ctx.globalAlpha = item.opacity ?? 1;
        ctx.fillStyle = item.color || '#ffffff';
        ctx.font = `${item.fontWeight || 600} ${item.fontSize || 34}px Inter, sans-serif`;
        ctx.textBaseline = 'alphabetic';
        try { ctx.letterSpacing = `${item.letterSpacing || 0}px`; } catch (e) { /* older canvas */ }
        const y = H - (item.bottomPct / 100) * H;
        const align = item.align || 'center';
        ctx.textAlign = align === 'left' ? 'left' : align === 'right' ? 'right' : 'center';
        const x = align === 'left' ? FOOTER_PAD_X : align === 'right' ? W - FOOTER_PAD_X : W / 2;
        ctx.fillText(item.text || '', x, y);
        try { ctx.letterSpacing = '0px'; } catch (e) { /* ignore */ }
        ctx.restore();
        return;
    }

    // progress bar
    const th = Math.max(1, item.thickness || 8);
    const barW = (item.widthPct / 100) * W;
    const x = (W - barW) / 2;
    const y = H - (item.bottomPct / 100) * H - th;
    const track = rgba(item.color, item.trackOpacity ?? 0.22);
    const fill = item.color || '#ffffff';
    const style = item.barStyle || 'pill';

    ctx.save();
    if (style === 'segments') {
        const n = Math.max(1, Math.min(30, item.segments || 5));
        const gap = Math.max(4, th * 0.9);
        const segW = (barW - gap * (n - 1)) / n;
        for (let i = 0; i < n; i++) {
            const sx = x + i * (segW + gap);
            roundRect(ctx, sx, y, segW, th, th / 2); ctx.fillStyle = track; ctx.fill();
            const f = clamp01((p - i / n) / (1 / n));
            if (f > 0) { roundRect(ctx, sx, y, segW * f, th, th / 2); ctx.fillStyle = fill; ctx.fill(); }
        }
        ctx.restore();
        return;
    }

    const r = style === 'line' ? 0 : th / 2;
    roundRect(ctx, x, y, barW, th, r); ctx.fillStyle = track; ctx.fill();
    if (p > 0.0005) { roundRect(ctx, x, y, barW * p, th, r); ctx.fillStyle = fill; ctx.fill(); }
    if (style === 'knob') {
        ctx.beginPath();
        ctx.arc(x + barW * p, y + th / 2, th * 1.3, 0, Math.PI * 2);
        ctx.fillStyle = fill; ctx.fill();
    }
    ctx.restore();
};

// Draw every footer element onto a 1080x1920 context at the given progress.
export const drawFooter = (ctx, footerItems, progress) => {
    if (!footerItems || !footerItems.length) return;
    for (const item of footerItems) drawFooterItem(ctx, item, progress);
};

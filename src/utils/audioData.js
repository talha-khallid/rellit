// Web Audio's AudioBuffer can't be JSON-serialized (it stringifies to `{}`),
// so we persist the ORIGINAL encoded audio file bytes as a base64 string on the
// segment (`audioData`) and re-decode it into an AudioBuffer on project load.

export const arrayBufferToBase64 = (buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const CHUNK = 0x8000; // avoid arg-count limits on String.fromCharCode
    for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
};

export const base64ToArrayBuffer = (base64) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
};

// Decode a stored base64 audio blob back into an AudioBuffer.
export const decodeStoredAudio = async (audioCtx, base64) => {
    const arrayBuffer = base64ToArrayBuffer(base64);
    return audioCtx.decodeAudioData(arrayBuffer);
};

// ---------------------------------------------------------------------------
// Audio editing. A segment may carry `audioEdit = { start, end, cuts: [[s,e]…] }`
// in SOURCE seconds: keep [start,end] of the original audio, minus each middle
// `cut` interval. This is purely non-destructive — the original bytes are kept and
// the edited AudioBuffer is derived on demand (and cached) for playback/export.
// ---------------------------------------------------------------------------
const clampN = (v, min, max) => Math.min(Math.max(v, min), max);

// Resolve an edit against the true duration into sorted, merged KEEP intervals.
export const editToKeeps = (edit, totalDur) => {
    const start = clampN(edit?.start ?? 0, 0, totalDur);
    const end = clampN(edit?.end ?? totalDur, start, totalDur);
    const cuts = (edit?.cuts || [])
        .map(c => [clampN(c[0], start, end), clampN(c[1], start, end)])
        .filter(c => c[1] - c[0] > 0.0005)
        .sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const c of cuts) {
        const last = merged[merged.length - 1];
        if (last && c[0] <= last[1]) last[1] = Math.max(last[1], c[1]);
        else merged.push([...c]);
    }
    const keeps = [];
    let cur = start;
    for (const [cs, ce] of merged) { if (cs > cur) keeps.push([cur, cs]); cur = Math.max(cur, ce); }
    if (end > cur) keeps.push([cur, end]);
    return keeps;
};

// Is this edit a no-op (keeps the whole buffer)?
export const isEmptyEdit = (edit, totalDur) => {
    const keeps = editToKeeps(edit, totalDur);
    return keeps.length === 1 && keeps[0][0] <= 0.0005 && keeps[0][1] >= totalDur - 0.0005;
};

// Total playable seconds left after an edit.
export const editedDuration = (edit, totalDur) =>
    editToKeeps(edit, totalDur).reduce((a, [s, e]) => a + (e - s), 0);

// Concatenate the kept intervals into a fresh AudioBuffer.
export const spliceAudioBuffer = (audioCtx, buffer, keeps) => {
    const sr = buffer.sampleRate, ch = buffer.numberOfChannels;
    const segs = keeps.map(([s, e]) => [Math.floor(s * sr), Math.floor(e * sr)]);
    let total = 0;
    for (const [a, b] of segs) total += Math.max(0, b - a);
    const out = audioCtx.createBuffer(ch, Math.max(1, total), sr);
    for (let c = 0; c < ch; c++) {
        const src = buffer.getChannelData(c);
        const dst = out.getChannelData(c);
        let off = 0;
        for (const [a, b] of segs) { const len = Math.max(0, b - a); if (len > 0) dst.set(src.subarray(a, b), off); off += len; }
    }
    return out;
};

// Return the edited AudioBuffer for a segment's edit (cached per source buffer),
// or the original buffer unchanged when there's no meaningful edit.
const _editCache = new WeakMap();
export const getEditedBuffer = (audioCtx, buffer, edit) => {
    if (!buffer || typeof buffer.getChannelData !== 'function') return buffer;
    if (!edit || isEmptyEdit(edit, buffer.duration)) return buffer;
    const keeps = editToKeeps(edit, buffer.duration);
    const sig = JSON.stringify(keeps);
    const cached = _editCache.get(buffer);
    if (cached && cached.sig === sig) return cached.edited;
    const edited = spliceAudioBuffer(audioCtx, buffer, keeps);
    _editCache.set(buffer, { sig, edited });
    return edited;
};

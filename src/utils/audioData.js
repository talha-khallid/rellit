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

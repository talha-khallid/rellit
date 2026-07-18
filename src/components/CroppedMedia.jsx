import React, { useState, useEffect, useRef, forwardRef } from 'react';
import { cropSourceRect } from '../utils/mediaLayout';
import { CroppedImage } from './CroppedImage';

// A cropped <video>, mirroring CroppedImage's crop math but for a video element.
// Forwards a ref to the underlying <video> so playback (play/pause/seek) can be
// driven externally by the preview's timeline clock.
export const CroppedVideo = forwardRef(({ src, boxW, boxH, crop, muted = true, style, mediaStyle }, ref) => {
    const [natural, setNatural] = useState(null);
    const localRef = useRef(null);

    const setRefs = (el) => {
        localRef.current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref) ref.current = el;
    };

    const apply = (w, h) => { if (w && h) setNatural({ w, h }); };

    // Read intrinsic size on metadata — and immediately if already available (a
    // cached video can report videoWidth before onLoadedMetadata attaches).
    useEffect(() => {
        setNatural(null);
        const v = localRef.current;
        if (v && v.videoWidth) apply(v.videoWidth, v.videoHeight);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [src]);

    let pos = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' };
    if (natural) {
        const { sx, sy, sw } = cropSourceRect(natural.w, natural.h, crop);
        const scale = boxW / sw;                 // crop width fills the box width
        pos = { position: 'absolute', width: natural.w * scale, height: natural.h * scale, left: -sx * scale, top: -sy * scale };
    }

    return (
        <div style={{ position: 'relative', width: boxW, height: boxH, overflow: 'hidden', ...style }}>
            <video
                ref={setRefs}
                src={src}
                muted={muted}
                playsInline
                preload="auto"
                onLoadedMetadata={e => apply(e.target.videoWidth, e.target.videoHeight)}
                style={{ ...pos, maxWidth: 'none', ...mediaStyle }}
            />
        </div>
    );
});
CroppedVideo.displayName = 'CroppedVideo';

// Dispatch to the right cropped element based on the item's type. Used for
// non-playback surfaces (thumbnails); the live preview uses CroppedVideo /
// CroppedImage directly so it can hold the video ref.
export const CroppedMedia = forwardRef(({ item, boxW, boxH, muted, style }, ref) => {
    if (item.type === 'video') {
        return <CroppedVideo ref={ref} src={item.src} boxW={boxW} boxH={boxH} crop={item.crop} muted={muted} style={style} />;
    }
    return <CroppedImage src={item.src} boxW={boxW} boxH={boxH} crop={item.crop} style={style} />;
});
CroppedMedia.displayName = 'CroppedMedia';

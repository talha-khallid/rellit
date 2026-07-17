import React, { useState, useEffect } from 'react';
import { computeCropGeometry } from '../utils/mediaLayout';

// Renders `src` inside a boxW x boxH window. For the common case (zoom === 1)
// this is just native CSS object-fit/object-position — visible immediately,
// no dependency on JS-measured image size, and mathematically identical to
// the canvas export's crop math (computeCropGeometry's cover formula reduces
// to the standard object-position formula exactly when zoom is 1). Custom
// zoom (zoom > 1, no native CSS equivalent) switches to precise pixel math
// once the image's natural size is known, matching the export exactly.
export const CroppedImage = ({ src, boxW, boxH, fit = 'cover', focalX = 0.5, focalY = 0.5, zoom = 1, onNaturalSize, style, imgStyle }) => {
    const [natural, setNatural] = useState(null);

    useEffect(() => { setNatural(null); }, [src]);

    const handleLoad = (e) => {
        const { naturalWidth: w, naturalHeight: h } = e.target;
        if (!w || !h) return; // broken/undecodable image — keep the CSS fallback
        const size = { w, h };
        setNatural(size);
        if (onNaturalSize) onNaturalSize(size);
    };

    let imgPosStyle = {
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        objectFit: fit, objectPosition: `${(focalX ?? 0.5) * 100}% ${(focalY ?? 0.5) * 100}%`
    };

    if (natural && zoom > 1) {
        const geo = computeCropGeometry(natural.w, natural.h, boxW, boxH, fit, focalX, focalY, zoom);
        if (geo) {
            imgPosStyle = geo.mode === 'contain'
                ? { position: 'absolute', width: geo.dw, height: geo.dh, left: (boxW - geo.dw) / 2, top: (boxH - geo.dh) / 2 }
                : { position: 'absolute', width: natural.w * geo.effScale, height: natural.h * geo.effScale, left: -geo.sx * geo.effScale, top: -geo.sy * geo.effScale };
        }
    }

    return (
        <div style={{ position: 'relative', width: boxW, height: boxH, overflow: 'hidden', ...style }}>
            <img
                src={src}
                alt=""
                draggable={false}
                onLoad={handleLoad}
                style={{ ...imgPosStyle, maxWidth: 'none', ...imgStyle }}
            />
        </div>
    );
};

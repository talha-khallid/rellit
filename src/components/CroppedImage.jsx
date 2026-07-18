import React, { useState, useEffect, useRef } from 'react';
import { cropSourceRect } from '../utils/mediaLayout';

// Renders the `crop` sub-rectangle of `src` filling a boxW x boxH window, using
// the same source-rect math as the canvas export (cropSourceRect) so the editor
// preview and the exported video match exactly.
export const CroppedImage = ({ src, boxW, boxH, crop, onNaturalSize, style, imgStyle }) => {
    const [natural, setNatural] = useState(null);
    const imgRef = useRef(null);

    const apply = (w, h) => {
        if (!w || !h) return;
        setNatural({ w, h });
        if (onNaturalSize) onNaturalSize({ w, h });
    };

    // Read the natural size on load — AND immediately if the image is already
    // cached/complete, because for a cached data URL the `load` event can fire
    // before React attaches onLoad, which would otherwise leave us with no size
    // (and thus fall back to an uncropped object-fit:cover).
    useEffect(() => {
        setNatural(null);
        const img = imgRef.current;
        if (img && img.complete && img.naturalWidth) {
            apply(img.naturalWidth, img.naturalHeight);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [src]);

    let imgPosStyle = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' };

    if (natural) {
        const { sx, sy, sw } = cropSourceRect(natural.w, natural.h, crop);
        const scale = boxW / sw;                 // crop width fills the box width
        imgPosStyle = {
            position: 'absolute',
            width: natural.w * scale,
            height: natural.h * scale,
            left: -sx * scale,
            top: -sy * scale
        };
    }

    return (
        <div style={{ position: 'relative', width: boxW, height: boxH, overflow: 'hidden', ...style }}>
            <img
                ref={imgRef}
                src={src}
                alt=""
                draggable={false}
                onLoad={(e) => apply(e.target.naturalWidth, e.target.naturalHeight)}
                style={{ ...imgPosStyle, maxWidth: 'none', ...imgStyle }}
            />
        </div>
    );
};

import React, { useState, useContext, useRef } from 'react';
import { EditorContext } from '../context/EditorContext';

export const ComponentCreator = () => {
    const { customComponents, setCustomComponents, armedComponentId, setArmedComponentId } = useContext(EditorContext);
    const [imageSrc, setImageSrc] = useState(null);
    const [size, setSize] = useState(40);
    const [animation, setAnimation] = useState('scale-rotate-left');
    const fileInputRef = useRef(null);

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (evt) => setImageSrc(evt.target.result);
            reader.readAsDataURL(file);
        }
    };

    const handlePaste = (e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (let index in items) {
            const item = items[index];
            if (item.kind === 'file') {
                const blob = item.getAsFile();
                const reader = new FileReader();
                reader.onload = (evt) => setImageSrc(evt.target.result);
                reader.readAsDataURL(blob);
            }
        }
    };

    const handleAdd = () => {
        if (!imageSrc) return;
        const newComp = {
            id: `comp_${Date.now()}`,
            src: imageSrc,
            size,
            animation
        };
        setCustomComponents([...customComponents, newComp]);
        setImageSrc(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
                <span className="context-label" style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, display: 'block', fontWeight: 500 }}>Create Component</span>
                <h3 className="context-title" style={{ fontSize: 20, fontWeight: 500, margin: '0 0 15px 0', color: '#fff' }}>Inline Images</h3>
            </div>

            <div 
                className="upload-area"
                onPaste={handlePaste}
                onClick={() => fileInputRef.current?.click()}
                style={{
                    border: '2px dashed var(--border)',
                    borderRadius: '8px',
                    padding: '30px 20px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    background: 'var(--bg-input)',
                    transition: 'border 0.2s',
                    position: 'relative'
                }}
            >
                {imageSrc ? (
                    <img src={imageSrc} alt="Preview" style={{ maxWidth: '100%', maxHeight: '100px', objectFit: 'contain' }} />
                ) : (
                    <div>Click to Upload or Paste Image (Ctrl+V)</div>
                )}
                <input 
                    type="file" 
                    accept="image/*" 
                    ref={fileInputRef} 
                    style={{ display: 'none' }} 
                    onChange={handleFileUpload}
                />
            </div>

            <div className="prop-group">
                <label>Size (px)</label>
                <input 
                    type="number" 
                    className="panel-input" 
                    value={size} 
                    onChange={(e) => setSize(parseInt(e.target.value) || 40)} 
                />
            </div>

            <button className="btn-primary" onClick={handleAdd} disabled={!imageSrc}>
                Add Component to Gallery
            </button>

            {customComponents.length > 0 && (
                <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
                    <h3 className="context-title" style={{ fontSize: 16, fontWeight: 500, margin: '0 0 15px 0', color: '#fff' }}>Component Gallery</h3>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {customComponents.map(comp => (
                            <div key={comp.id} style={{ 
                                background: 'var(--bg-input)', padding: '8px', borderRadius: '6px', 
                                border: armedComponentId === comp.id ? '1px solid var(--accent)' : '1px solid var(--border)',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8
                            }}>
                                <img src={comp.src} alt="comp" style={{ width: 40, height: 40, objectFit: 'contain' }} />
                                <button 
                                    className="btn-ghost" 
                                    style={{ 
                                        padding: '4px 12px', fontSize: 11, 
                                        background: armedComponentId === comp.id ? 'var(--accent)' : 'transparent', 
                                        color: armedComponentId === comp.id ? '#fff' : 'inherit' 
                                    }}
                                    onClick={() => setArmedComponentId(armedComponentId === comp.id ? null : comp.id)}
                                >
                                    {armedComponentId === comp.id ? 'Holding...' : 'Hold'}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

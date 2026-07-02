import React, { useState, useEffect } from 'react';
import { getProjects, createProject, deleteProject, updateProjectName } from '../utils/storage';

export const Dashboard = ({ onOpenProject }) => {
    const [projects, setProjects] = useState([]);
    const [isCreating, setIsCreating] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState('');

    useEffect(() => {
        setProjects(getProjects());
    }, []);

    const handleCreateProject = async () => {
        if (isCreating) return;
        setIsCreating(true);
        const newProj = await createProject();
        onOpenProject(newProj.id);
        setIsCreating(false);
    };

    const handleDelete = (e, id) => {
        e.stopPropagation();
        if (confirm('Are you sure you want to delete this project?')) {
            deleteProject(id);
            setProjects(getProjects());
        }
    };

    const startEditing = (e, proj) => {
        e.stopPropagation();
        setEditingId(proj.id);
        setEditName(proj.name);
    };

    const saveEdit = (e, id) => {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
        }
        if (editName.trim()) {
            updateProjectName(id, editName.trim());
            setProjects(getProjects());
        }
        setEditingId(null);
    };

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <div style={styles.logo}>Rellit</div>
            </div>
            
            <div style={styles.content}>
                <h1 style={styles.title}>Projects</h1>
                
                <div style={styles.grid}>
                    {/* New Project Card */}
                    <div style={styles.newProjectCard} onClick={handleCreateProject}>
                        <div style={styles.plusIcon}>+</div>
                        <div style={styles.newProjectText}>{isCreating ? 'Creating...' : 'New Project'}</div>
                    </div>

                    {/* Existing Projects */}
                    {projects.map(proj => (
                        <div key={proj.id} style={styles.card} onClick={() => onOpenProject(proj.id)}>
                            <div style={styles.thumbnail}>
                                {/* Abstract premium placeholder */}
                                <div style={{...styles.thumbGradient, background: `linear-gradient(135deg, #${proj.id.substr(-6)} 0%, #1a1a1a 100%)`}}></div>
                                <div style={styles.playIcon}>▶</div>
                            </div>
                            
                            <div style={styles.cardFooter}>
                                <div style={styles.cardInfo}>
                                    {editingId === proj.id ? (
                                        <form onSubmit={(e) => saveEdit(e, proj.id)}>
                                            <input 
                                                autoFocus
                                                type="text" 
                                                value={editName}
                                                onChange={e => setEditName(e.target.value)}
                                                onBlur={(e) => saveEdit(e, proj.id)}
                                                style={styles.editInput}
                                                onClick={e => e.stopPropagation()}
                                            />
                                        </form>
                                    ) : (
                                        <div style={styles.projectName} onClick={(e) => startEditing(e, proj)}>{proj.name}</div>
                                    )}
                                    <div style={styles.projectDate}>{new Date(proj.lastModified).toLocaleDateString()} {new Date(proj.lastModified).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                                </div>
                                <button style={styles.deleteBtn} onClick={(e) => handleDelete(e, proj.id)}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="3 6 5 6 21 6"></polyline>
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const styles = {
    container: {
        width: '100vw',
        height: '100vh',
        backgroundColor: '#0a0a0a',
        color: '#fff',
        fontFamily: 'Inter, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
    },
    header: {
        height: '60px',
        backgroundColor: '#111',
        borderBottom: '1px solid #222',
        display: 'flex',
        alignItems: 'center',
        padding: '0 32px'
    },
    logo: {
        fontWeight: 600,
        fontSize: '18px',
        letterSpacing: '0.5px'
    },
    content: {
        flex: 1,
        padding: '48px',
        overflowY: 'auto'
    },
    title: {
        fontSize: '24px',
        fontWeight: 600,
        marginBottom: '32px',
        color: '#f0f0f0'
    },
    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: '24px'
    },
    newProjectCard: {
        backgroundColor: '#161616',
        border: '1px dashed #333',
        borderRadius: '12px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        aspectRatio: '16/9',
        transition: 'all 0.2s ease',
        ':hover': {
            borderColor: '#863bff',
            backgroundColor: '#1a1a1a'
        }
    },
    plusIcon: {
        fontSize: '32px',
        color: '#863bff',
        marginBottom: '8px'
    },
    newProjectText: {
        fontSize: '14px',
        fontWeight: 500,
        color: '#aaa'
    },
    card: {
        backgroundColor: '#161616',
        borderRadius: '12px',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        border: '1px solid #222',
        display: 'flex',
        flexDirection: 'column'
    },
    thumbnail: {
        aspectRatio: '16/9',
        backgroundColor: '#000',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
    },
    thumbGradient: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        opacity: 0.6
    },
    playIcon: {
        position: 'relative',
        zIndex: 1,
        color: '#fff',
        fontSize: '24px',
        opacity: 0.8
    },
    cardFooter: {
        padding: '12px 16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTop: '1px solid #222'
    },
    cardInfo: {
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        overflow: 'hidden'
    },
    projectName: {
        fontSize: '14px',
        fontWeight: 500,
        color: '#eee',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
    },
    projectDate: {
        fontSize: '12px',
        color: '#777'
    },
    deleteBtn: {
        background: 'none',
        border: 'none',
        color: '#555',
        cursor: 'pointer',
        padding: '4px',
        borderRadius: '4px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'color 0.2s'
    },
    editInput: {
        background: '#000',
        border: '1px solid #863bff',
        color: '#fff',
        fontSize: '14px',
        fontWeight: 500,
        padding: '2px 4px',
        borderRadius: '4px',
        width: '100%',
        outline: 'none'
    }
};

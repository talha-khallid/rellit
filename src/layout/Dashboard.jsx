import React, { useState, useEffect, useMemo } from 'react';
import { getProjects, createProject, deleteProject, updateProjectName, duplicateProject } from '../utils/storage';

const hueFromId = (id) => {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = (hash * 31 + id.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % 360;
};

const formatRelativeTime = (ts) => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(ts).toLocaleDateString();
};

const formatDuration = (secs) => {
    if (!secs) return '0s';
    if (secs < 60) return `${Math.round(secs)}s`;
    return `${Math.floor(secs / 60)}m ${Math.round(secs % 60)}s`;
};

export const Dashboard = ({ onOpenProject }) => {
    const [projects, setProjects] = useState([]);
    const [isCreating, setIsCreating] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState('');
    const [query, setQuery] = useState('');

    const refreshProjects = () => getProjects().then(setProjects);

    useEffect(() => {
        refreshProjects();
    }, []);

    const metaById = useMemo(() => {
        const map = {};
        projects.forEach(p => { map[p.id] = p.meta; });
        return map;
    }, [projects]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return projects;
        return projects.filter(p => p.name.toLowerCase().includes(q));
    }, [projects, query]);

    const handleCreateProject = async () => {
        if (isCreating) return;
        setIsCreating(true);
        const newProj = await createProject();
        onOpenProject(newProj.id);
        setIsCreating(false);
    };

    const handleDelete = async (e, id) => {
        e.stopPropagation();
        if (confirm('Are you sure you want to delete this project?')) {
            await deleteProject(id);
            await refreshProjects();
        }
    };

    const handleDuplicate = async (e, id) => {
        e.stopPropagation();
        await duplicateProject(id);
        await refreshProjects();
    };

    const startEditing = (e, proj) => {
        e.stopPropagation();
        setEditingId(proj.id);
        setEditName(proj.name);
    };

    const saveEdit = async (e, id) => {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
        }
        if (editName.trim()) {
            await updateProjectName(id, editName.trim());
            await refreshProjects();
        }
        setEditingId(null);
    };

    return (
        <div className="dash-container">
            <div className="dash-header">
                <div className="dash-logo">
                    <div className="dash-logo-mark">R</div>
                    Rellit
                </div>
            </div>

            <div className="dash-content">
                <div className="dash-inner">
                    <div className="dash-toolbar">
                        <div>
                            <h1 className="dash-title">Projects</h1>
                            <p className="dash-subtitle">
                                {projects.length === 0
                                    ? 'Create caption videos with word-by-word highlighting'
                                    : `${projects.length} project${projects.length === 1 ? '' : 's'}`}
                            </p>
                        </div>
                        <div className="dash-toolbar-right">
                            {projects.length > 0 && (
                                <div className="dash-search">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="11" cy="11" r="8"></circle>
                                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                                    </svg>
                                    <input
                                        type="text"
                                        placeholder="Search projects..."
                                        value={query}
                                        onChange={e => setQuery(e.target.value)}
                                    />
                                </div>
                            )}
                            <button className="dash-new-btn" onClick={handleCreateProject} disabled={isCreating}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                    <line x1="12" y1="5" x2="12" y2="19"></line>
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                </svg>
                                {isCreating ? 'Creating...' : 'New Project'}
                            </button>
                        </div>
                    </div>

                    {projects.length === 0 ? (
                        <div className="dash-empty">
                            <div className="dash-empty-icon">
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="2" y="4" width="20" height="16" rx="3"></rect>
                                    <path d="M10 9l5 3-5 3z" fill="currentColor" stroke="none"></path>
                                </svg>
                            </div>
                            <h3>No projects yet</h3>
                            <p>Start a new project to turn your script and voiceover into an animated caption video.</p>
                            <button className="dash-new-btn" onClick={handleCreateProject} disabled={isCreating}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                    <line x1="12" y1="5" x2="12" y2="19"></line>
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                </svg>
                                {isCreating ? 'Creating...' : 'Create your first project'}
                            </button>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="dash-empty">
                            <h3>No matches</h3>
                            <p>No projects match “{query}”.</p>
                        </div>
                    ) : (
                        <div className="dash-grid">
                            {filtered.map(proj => {
                                const meta = metaById[proj.id] || { segmentCount: 0, totalDuration: 0, firstText: '' };
                                const hue = hueFromId(proj.id);
                                return (
                                    <div key={proj.id} className="dash-card" onClick={() => onOpenProject(proj.id)}>
                                        <div
                                            className="dash-thumb"
                                            style={{ background: `linear-gradient(135deg, hsl(${hue}, 40%, 26%) 0%, #101013 85%)` }}
                                        >
                                            {meta.firstText && (
                                                <div className="dash-thumb-text">{meta.firstText}</div>
                                            )}
                                            <div className="dash-thumb-play">
                                                <div className="dash-thumb-play-circle">
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                                        <path d="M8 5v14l11-7z"></path>
                                                    </svg>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="dash-card-footer">
                                            <div className="dash-card-info">
                                                {editingId === proj.id ? (
                                                    <form onSubmit={(e) => saveEdit(e, proj.id)}>
                                                        <input
                                                            autoFocus
                                                            type="text"
                                                            className="dash-name-input"
                                                            value={editName}
                                                            onChange={e => setEditName(e.target.value)}
                                                            onBlur={(e) => saveEdit(e, proj.id)}
                                                            onClick={e => e.stopPropagation()}
                                                        />
                                                    </form>
                                                ) : (
                                                    <div className="dash-card-name" onClick={(e) => startEditing(e, proj)} title="Click to rename">
                                                        {proj.name}
                                                    </div>
                                                )}
                                                <div className="dash-card-meta">
                                                    {meta.segmentCount} segment{meta.segmentCount === 1 ? '' : 's'} · {formatDuration(meta.totalDuration)} · {formatRelativeTime(proj.lastModified)}
                                                </div>
                                            </div>
                                            <div className="dash-card-actions">
                                                <button className="icon-btn" title="Duplicate project" onClick={(e) => handleDuplicate(e, proj.id)}>
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <rect x="9" y="9" width="13" height="13" rx="2"></rect>
                                                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                                    </svg>
                                                </button>
                                                <button className="icon-btn danger" title="Delete project" onClick={(e) => handleDelete(e, proj.id)}>
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <polyline points="3 6 5 6 21 6"></polyline>
                                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

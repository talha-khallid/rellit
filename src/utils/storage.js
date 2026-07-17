// Client-side persistence layer. Talks to the SQLite-backed API that runs
// inside the Vite server (see server/sqlite-api.js), so all data lives in a
// real `rellit.db` file on disk instead of browser storage. Every function is
// async because it goes over HTTP.
const BASE = '/api/projects';

const request = async (url, options) => {
    const res = await fetch(url, options);
    if (!res.ok) {
        let detail = '';
        try { detail = (await res.json()).error; } catch { /* ignore */ }
        throw new Error(`Request to ${url} failed (${res.status})${detail ? `: ${detail}` : ''}`);
    }
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
};

const jsonPost = (url, method, body) => request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
});

// Returns [{ id, name, lastModified, meta: { segmentCount, totalDuration, firstText } }]
export const getProjects = async () => {
    try {
        return await request(BASE);
    } catch (e) {
        console.error('Failed to load projects from storage', e);
        return [];
    }
};

export const createProject = async () => {
    const id = 'proj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    // Fetch initial layout (served from /public)
    let initialSegments = [];
    try {
        const res = await fetch('/captions.json');
        if (res.ok) initialSegments = await res.json();
    } catch (e) {
        // Fallback
        initialSegments = [
            { text: "Dynamic text highlighting creates a reading rhythm...", duration: 8.0 },
            { text: "Standard interfaces often present overwhelming walls of text...", duration: 6.0 }
        ];
    }

    // Name it based on how many projects already exist.
    const existing = await getProjects();
    const name = `Untitled Project ${existing.length + 1}`;
    const lastModified = Date.now();

    const data = {
        segments: initialSegments,
        videoBgColor: '#050505',
        videoAlignPercent: 50,
        fontFamily: 'Inter, sans-serif',
        fontWeight: 500,
        textTransform: 'none',
        fontSize: 45,
        textAlign: 'left',
        letterSpacing: 0,
        timelineScale: 70,
        customComponents: [],
        visualLines: [],
        lineSettings: {},
        charOverrides: {},
        mediaItems: []
    };

    await jsonPost(BASE, 'POST', { id, name, lastModified, data });
    return { id, name, lastModified };
};

// Returns { id, name, lastModified, data } or null
export const loadProject = async (id) => {
    try {
        return await request(`${BASE}/${id}`);
    } catch (e) {
        console.error(`Failed to load data for project ${id}`, e);
        return null;
    }
};

export const saveProjectData = async (id, data) => {
    return jsonPost(`${BASE}/${id}`, 'PUT', { data });
};

export const updateProjectName = async (id, newName) => {
    return jsonPost(`${BASE}/${id}`, 'PATCH', { name: newName });
};

export const duplicateProject = async (id) => {
    try {
        return await request(`${BASE}/${id}/duplicate`, { method: 'POST' });
    } catch (e) {
        console.error(`Failed to duplicate project ${id}`, e);
        return null;
    }
};

export const deleteProject = async (id) => {
    try {
        return await request(`${BASE}/${id}`, { method: 'DELETE' });
    } catch (e) {
        console.error(`Failed to delete project ${id}`, e);
        return null;
    }
};

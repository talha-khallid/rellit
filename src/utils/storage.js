const STORAGE_KEY = 'rellit_projects';

export const getProjects = () => {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (!data) return [];
        return JSON.parse(data).sort((a, b) => b.lastModified - a.lastModified);
    } catch (e) {
        console.error('Failed to load projects from storage', e);
        return [];
    }
};

const saveProjectsList = (projects) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    } catch (e) {
        console.error('Failed to save projects to storage', e);
    }
};

export const createProject = async () => {
    const projects = getProjects();
    const id = 'proj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    // Fetch initial layout
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

    const newProject = {
        id,
        name: `Untitled Project ${projects.length + 1}`,
        lastModified: Date.now(),
        // We only save the metadata in the main list to keep it lightweight.
    };

    projects.push(newProject);
    saveProjectsList(projects);

    // Save the actual bulky project data in a separate key to avoid JSON parsing a massive array on dashboard load.
    const projectData = {
        segments: initialSegments,
        videoBgColor: '#050505',
        videoAlignPercent: 50,
        fontFamily: 'Inter, sans-serif',
        fontWeight: 500,
        textTransform: 'none',
        fontSize: 45,
        textAlign: 'left',
        letterSpacing: 0,
        customComponents: [],
        visualLines: [],
        lineSettings: {},
        charOverrides: {}
    };

    saveProjectData(id, projectData);
    
    return newProject;
};

export const loadProject = (id) => {
    try {
        const data = localStorage.getItem(`rellit_data_${id}`);
        if (!data) return null;
        return JSON.parse(data);
    } catch (e) {
        console.error(`Failed to load data for project ${id}`, e);
        return null;
    }
};

export const saveProjectData = (id, data) => {
    try {
        localStorage.setItem(`rellit_data_${id}`, JSON.stringify(data));
        
        // Update the lastModified timestamp
        const projects = getProjects();
        const pIdx = projects.findIndex(p => p.id === id);
        if (pIdx > -1) {
            projects[pIdx].lastModified = Date.now();
            saveProjectsList(projects);
        }
    } catch (e) {
        console.error(`Failed to save data for project ${id}`, e);
    }
};

export const updateProjectName = (id, newName) => {
    const projects = getProjects();
    const pIdx = projects.findIndex(p => p.id === id);
    if (pIdx > -1) {
        projects[pIdx].name = newName;
        projects[pIdx].lastModified = Date.now();
        saveProjectsList(projects);
    }
};

export const deleteProject = (id) => {
    const projects = getProjects();
    const newProjects = projects.filter(p => p.id !== id);
    saveProjectsList(newProjects);
    localStorage.removeItem(`rellit_data_${id}`);
};

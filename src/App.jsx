import React, { useState } from 'react';
import { EditorProvider } from './context/EditorContext';
import { AppLayout } from './layout/AppLayout';
import { Dashboard } from './layout/Dashboard';

function App() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [activeProjectId, setActiveProjectId] = useState(null);

  const handleOpenProject = (id) => {
    setActiveProjectId(id);
    setCurrentView('editor');
  };

  const handleGoHome = () => {
    setActiveProjectId(null);
    setCurrentView('dashboard');
  };

  if (currentView === 'dashboard') {
    return <Dashboard onOpenProject={handleOpenProject} />;
  }

  return (
    <EditorProvider projectId={activeProjectId} onGoHome={handleGoHome}>
      <AppLayout />
    </EditorProvider>
  );
}

export default App;

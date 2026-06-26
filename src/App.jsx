import React from 'react';
import { EditorProvider } from './context/EditorContext';
import { AppLayout } from './components/layout/AppLayout';

function App() {
  return (
    <EditorProvider>
      <AppLayout />
    </EditorProvider>
  );
}

export default App;

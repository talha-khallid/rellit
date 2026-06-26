import React from 'react';
import { EditorProvider } from './context/EditorContext';
import { AppLayout } from './components/AppLayout';

function App() {
  return (
    <EditorProvider>
      <AppLayout />
    </EditorProvider>
  );
}

export default App;

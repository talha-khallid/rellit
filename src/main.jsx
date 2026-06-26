import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

window.addEventListener('error', (e) => {
    document.body.innerHTML += `<div style="position:fixed;top:0;left:0;right:0;background:red;color:white;z-index:999999;padding:20px;font-family:monospace;white-space:pre-wrap;">${e.error ? e.error.stack : e.message}</div>`;
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

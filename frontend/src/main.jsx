import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import App from './App.jsx';
import './index.css';
import { SettingsProvider } from './context/SettingsContext.jsx';
import { PWAUpdatePrompt } from './components/ui/PWAUpdatePrompt.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
      <SettingsProvider>
        <App />
        <PWAUpdatePrompt />
      </SettingsProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);

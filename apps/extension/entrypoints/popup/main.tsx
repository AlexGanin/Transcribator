import React from 'react';
import { createRoot } from 'react-dom/client';
import { PopupApp } from './popup-app';
import './style.css';

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <PopupApp />
  </React.StrictMode>
);

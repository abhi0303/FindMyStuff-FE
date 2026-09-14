import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/tokens.css';
import './styles/base.css';

// Apply the stored theme before first paint so there is no light flash.
try {
  const stored = localStorage.getItem('fms.theme');
  document.documentElement.dataset.theme =
    stored === 'light' || stored === 'dark'
      ? stored
      : window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
} catch {
  document.documentElement.dataset.theme = 'light';
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

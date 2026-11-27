import '@fontsource-variable/inter';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles.css';

const root = document.getElementById('root')!;

// Refuse to run inside a frame on another site (protects against "clickjacking":
// a hidden copy of the app tricking you into typing your password).
if (window.top !== window.self) {
  root.textContent = 'For your security, Family Tree can’t be shown inside another website. Open it directly.';
} else {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

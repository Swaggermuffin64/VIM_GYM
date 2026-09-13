import React from 'react';
import ReactDOM, { hydrateRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import './index.css';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';

const container = document.getElementById('root')!;
const tree = (
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
    <Analytics />
  </React.StrictMode>
);

// Prerendered routes ship server markup; everything else mounts empty.
if (container.hasChildNodes()) {
  hydrateRoot(container, tree);
} else {
  ReactDOM.createRoot(container).render(tree);
}

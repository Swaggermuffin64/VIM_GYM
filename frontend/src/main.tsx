import React from 'react';
import ReactDOM, { hydrateRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import './index.css';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { hasStoredSession } from './lib/hasStoredSession';
import { shouldHydrate } from './lib/shouldHydrate';

const container = document.getElementById('root')!;
const tree = (
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
    <Analytics />
  </React.StrictMode>
);

// Prerendered routes ship the logged-out markup. Visitors hydrate it in
// place; members (whose first render is the loading screen) and the empty
// app shell mount fresh. See shouldHydrate.ts for why.
if (
  shouldHydrate({
    hasPrerenderedMarkup: container.hasChildNodes(),
    hasStoredSession: hasStoredSession(),
  })
) {
  hydrateRoot(container, tree);
} else {
  container.replaceChildren();
  ReactDOM.createRoot(container).render(tree);
}

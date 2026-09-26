import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import 'vazirmatn/Vazirmatn-Variable-font-face.css';

import { App } from './App';
import { registerServiceWorker } from './lib/pwa';
import './styles.css';
import './surveys.css';
import './styles/surveys-builder.css';
import './styles/surveys-collect.css';
import './styles/surveys-responses.css';
import './styles/surveys-campaigns.css';

registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

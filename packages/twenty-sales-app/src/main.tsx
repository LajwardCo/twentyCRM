import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import 'vazirmatn/Vazirmatn-Variable-font-face.css';

import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

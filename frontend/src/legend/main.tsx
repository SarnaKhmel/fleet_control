import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../i18n';
import '../theme/themeStore';
import '../styles/global.css';
import { Legend } from './Legend';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Legend />
  </StrictMode>,
);

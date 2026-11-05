import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './i18n';
import './theme/themeStore';
import './styles/global.css';
import { App } from './App';
import { startWindSync } from './wind/windSync';
import { startMissionSocket } from './mission/missionSocket';

startWindSync();
startMissionSocket();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

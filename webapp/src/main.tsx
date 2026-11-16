import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {I18nProvider} from './i18n';
import './index.css';

// Polices Google : chargées en « print » pour ne pas bloquer l'affichage, puis activées ici
// (la politique de sécurité du site interdit le onload="" en ligne).
document.querySelectorAll<HTMLLinkElement>('link[data-font]').forEach((l) => { l.media = 'all'; });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
);

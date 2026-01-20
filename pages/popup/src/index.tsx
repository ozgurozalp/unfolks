import { createRoot } from 'react-dom/client';
import '@extension/ui/dist/global.css';
import '@src/index.css';
import Popup from '@src/Popup';
import initTabSetup from '@src/helpers/initTabSetup';
import './i18n';
import { sentryClient } from '@extension/shared';
import { RateLimiterProvider } from '@src/hooks/useRateLimitedUnfollow';

function detectMobile() {
  const isMobile =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    ('ontouchstart' in window && window.innerWidth < 768);

  if (isMobile) {
    document.body.classList.add('is-mobile');
  }
}

async function init() {
  const appContainer = document.querySelector('#app-container');
  if (!appContainer) {
    throw new Error('Can not find #app-container');
  }
  detectMobile();
  sentryClient.init();
  const root = createRoot(appContainer);
  await initTabSetup();
  root.render(
    <RateLimiterProvider>
      <Popup />
    </RateLimiterProvider>,
  );
}

init();

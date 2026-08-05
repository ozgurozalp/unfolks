import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { Button, cn } from '@extension/ui';
import appIcon from '@src/assets/rock-paper-scissors.png';

// Bump this key to show the announcement again after a new release.
const DISMISSED_STORAGE_KEY = 'announcement-dismissed:rps-launch-v1';
const APP_STORE_URL = 'https://apps.apple.com/app/id6790094711';

export default function AnnouncementDialog() {
  const [visible, setVisible] = useState(() => localStorage.getItem(DISMISSED_STORAGE_KEY) === null);
  const { t } = useTranslation();

  const dismiss = () => {
    localStorage.setItem(DISMISSED_STORAGE_KEY, String(Date.now()));
    setVisible(false);
  };

  const openAppStore = () => {
    chrome.tabs.create({ url: APP_STORE_URL, active: true }).catch(console.error);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed inset-x-3 bottom-3 z-50"
        >
          <div className="relative rounded-2xl bg-white p-4 text-neutral-800 shadow-2xl">
            <button
              type="button"
              aria-label={t('announcementClose')}
              onClick={dismiss}
              className="absolute right-3 top-3 rounded-full p-1 text-neutral-400 transition-colors hover:text-neutral-600"
            >
              <X className="size-4" />
            </button>

            <div className="flex items-start gap-3">
              <img
                src={appIcon}
                alt={t('announcementTitle')}
                draggable="false"
                className="size-12 shrink-0 rounded-xl border border-neutral-200"
              />
              <div className="min-w-0 pr-6">
                <span
                  className={cn(
                    'inline-block rounded-md bg-teal-50 px-1.5 py-0.5',
                    'text-[10px] font-bold tracking-wide text-teal-700',
                  )}
                >
                  {t('announcementNew')}
                </span>
                <p className="mt-0.5 text-base font-bold leading-tight">{t('announcementTitle')}</p>
              </div>
            </div>

            <p className="mt-2 text-sm leading-snug text-neutral-600">{t('announcementDescription')}</p>

            <Button
              onClick={openAppStore}
              className="mt-3 h-10 w-full gap-2 rounded-xl bg-neutral-900 text-white hover:bg-neutral-800"
            >
              <AppleLogo />
              {t('announcementButton')}
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function AppleLogo() {
  return (
    <svg viewBox="0 0 814 1000" className="size-4 fill-current" aria-hidden="true">
      <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z" />
    </svg>
  );
}

import type { ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { LogIn, MousePointerClick, UserMinus, UserRoundSearch } from 'lucide-react';

interface OnboardingProps {
  hasInstagramTab: boolean;
  idleButtonText: string;
  loading: boolean;
  action: ReactNode;
}

const stepIcons = [LogIn, MousePointerClick, UserMinus];

export default function Onboarding({ hasInstagramTab, idleButtonText, loading, action }: OnboardingProps) {
  const { t } = useTranslation();
  const steps = [t('onboardingStep1'), t('onboardingStep2'), t('onboardingStep3')];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="flex w-full flex-col items-center gap-5 text-center"
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.05, type: 'spring', stiffness: 200, damping: 15 }}
        className="relative"
      >
        <div className="absolute inset-0 -z-10 rounded-full bg-primary/20 blur-2xl" />
        <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
          <UserRoundSearch className="size-8" strokeWidth={1.75} />
        </div>
      </motion.div>

      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{loading ? t('scanningTitle') : t('firstTime')}</h1>
        <p className="text-balance text-sm text-muted-foreground">
          {loading ? (
            t('scanningInfo')
          ) : hasInstagramTab ? (
            <Trans
              i18nKey="infoInInstagram"
              values={{ buttonText: idleButtonText }}
              components={{ bold: <strong key="bold" className="font-semibold text-foreground" /> }}
            />
          ) : (
            t('infoNotInInstagram')
          )}
        </p>
      </div>

      {!loading && (
        <ol className="w-full space-y-2 text-left">
          {steps.map((step, index) => {
            const Icon = stepIcons[index];
            return (
              <motion.li
                key={step}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + index * 0.08 }}
                className="flex items-center gap-3 rounded-xl border bg-muted/30 p-2.5"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-4" strokeWidth={2} />
                </span>
                <span className="text-sm text-foreground/90">{step}</span>
              </motion.li>
            );
          })}
        </ol>
      )}

      <div className="w-full">{action}</div>
    </motion.div>
  );
}

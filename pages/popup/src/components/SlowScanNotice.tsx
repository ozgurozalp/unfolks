import { Button } from '@extension/ui';
import { useTranslation } from 'react-i18next';
import { Hourglass, X } from 'lucide-react';
import SendLogsButton from '@src/components/SendLogsButton';

interface SlowScanNoticeProps {
  onCancel: () => void;
  detail?: string;
}

/** A first scan that runs long: the user can stop it to try again, or report what happened. */
export default function SlowScanNotice({ onCancel, detail }: SlowScanNoticeProps) {
  const { t } = useTranslation();

  return (
    <div className="mt-3 grid gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
      <div className="flex items-start gap-2">
        <Hourglass className="mt-0.5 size-4 shrink-0 text-amber-600" />
        <div className="min-w-0 space-y-1">
          <p className="font-medium">{t('slowScanTitle')}</p>
          <p className="text-muted-foreground">{t('slowScanHint')}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" className="flex-1" onClick={onCancel}>
          <X className="size-3.5" />
          {t('cancelScan')}
        </Button>
        <SendLogsButton detail={detail} />
      </div>
    </div>
  );
}

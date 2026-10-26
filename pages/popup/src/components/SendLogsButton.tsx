import { Button } from '@extension/ui';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Mail } from 'lucide-react';
import sendLogs from '@src/helpers/sendLogs';

interface SendLogsButtonProps {
  detail?: string;
  message?: string;
  className?: string;
}

/** Asks the Instagram tab for the scan's recent events; the panel then opens them in an email. */
export default function SendLogsButton({ detail, message, className }: SendLogsButtonProps) {
  const { t } = useTranslation();

  const send = async () => {
    if (await sendLogs(detail, message)) return;
    toast.error(t('logsFailed'), { id: 'logs-failed', position: 'bottom-center' });
  };

  return (
    <Button size="sm" variant="outline" className={className} onClick={send}>
      <Mail className="size-3.5" />
      {t('sendLogs')}
    </Button>
  );
}

import { TYPES } from '@extension/shared';
import { Button } from '@extension/ui';
import { useMainStore } from '@src/store';
import useNow from '@src/hooks/useNow';
import formatDuration from '@src/helpers/formatDuration';
import sendMessage from '@src/helpers/sendMessage';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import SendLogsButton from '@src/components/SendLogsButton';
import { Copy, PauseCircle, Play, RotateCcw } from 'lucide-react';

interface ScanStatusProps {
  loading: boolean;
  onResume: () => void;
  onDiscard: () => void;
}

/**
 * Shown when a scan stopped partway or Instagram asked to wait: how far it got,
 * when it may continue, and the one-line detail for bug reports.
 */
export default function ScanStatus({ loading, onResume, onDiscard }: ScanStatusProps) {
  const { t, i18n } = useTranslation();
  const checkpoint = useMainStore(state => state.checkpoint);
  const viewer = useMainStore(state => state.viewer);
  const scanIssue = useMainStore(state => state.scanIssue);
  const hasInstagramTab = useMainStore(state => state.hasInstagramTab);
  const cooldownUntil = checkpoint?.cooldownUntil ?? 0;
  const now = useNow(cooldownUntil > Date.now());

  // A checkpoint from another account says nothing about this one.
  const ownCheckpoint = checkpoint && (!viewer || viewer.id === checkpoint.viewerId) ? checkpoint : null;
  const waiting = ownCheckpoint && cooldownUntil > now ? cooldownUntil - now : 0;
  const canResume = Boolean(ownCheckpoint && ownCheckpoint.loaded > 0);

  if (loading || (!ownCheckpoint && !scanIssue)) return null;

  const copyDetail = async () => {
    if (!scanIssue?.detail) return;
    try {
      await navigator.clipboard.writeText(scanIssue.detail);
      toast.success(t('copyDetail'), { id: 'copy-detail', position: 'bottom-center' });
    } catch {
      toast.error(t('copyFailed'), { id: 'copy-failed', position: 'bottom-center' });
    }
  };

  const discard = () => {
    sendMessage({ type: TYPES.DISCARD_CHECKPOINT }).catch(console.error);
    onDiscard();
  };

  return (
    <div className="mt-3 grid gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
      <div className="flex items-start gap-2">
        <PauseCircle className="mt-0.5 size-4 shrink-0 text-amber-600" />
        <div className="min-w-0 space-y-1">
          <p className="font-medium">{canResume ? t('resumeTitle') : scanIssue?.message}</p>
          {canResume && scanIssue?.message && <p className="text-muted-foreground">{scanIssue.message}</p>}
          {canResume && ownCheckpoint && (
            <p className="text-muted-foreground">
              {ownCheckpoint.total
                ? t('resumeProgress', {
                    loaded: ownCheckpoint.loaded.toLocaleString(i18n.language),
                    total: ownCheckpoint.total.toLocaleString(i18n.language),
                  })
                : t('resumeProgressUnknown', { loaded: ownCheckpoint.loaded.toLocaleString(i18n.language) })}{' '}
              {!waiting && t('resumeHint')}
            </p>
          )}
          {waiting > 0 && (
            <p className="text-muted-foreground">{t('resumeWaiting', { time: formatDuration(waiting) })}</p>
          )}
        </div>
      </div>

      {scanIssue?.detail && (
        <div className="flex items-center gap-2">
          <code
            className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground"
            title={scanIssue.detail}
            aria-label={t('errorDetailLabel')}
          >
            {scanIssue.detail}
          </code>
          <Button variant="ghost" size="sm" className="size-8 p-0" onClick={copyDetail} aria-label={t('copyDetail')}>
            <Copy className="size-3.5" />
          </Button>
        </div>
      )}

      {scanIssue?.detail && (
        <SendLogsButton detail={scanIssue.detail} message={scanIssue.message} className="justify-self-start" />
      )}

      {hasInstagramTab && canResume && (
        <div className="flex gap-2">
          <Button size="sm" className="flex-1" disabled={waiting > 0} onClick={onResume}>
            <Play className="size-3.5" />
            {t('resumeButton')}
          </Button>
          <Button size="sm" variant="outline" onClick={discard}>
            <RotateCcw className="size-3.5" />
            {t('discardProgress')}
          </Button>
        </div>
      )}
    </div>
  );
}

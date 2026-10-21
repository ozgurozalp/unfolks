import type { User } from '@extension/shared';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Checkbox,
  Spinner,
} from '@extension/ui';
import { useMainStore } from '@src/store';
import { useRateLimitedUnfollow } from '@src/hooks/useRateLimitedUnfollow';
import useNow from '@src/hooks/useNow';
import copyUsernames from '@src/helpers/copyUsernames';
import formatDuration from '@src/helpers/formatDuration';
import { useTranslation } from 'react-i18next';
import { Copy, Pause, UserX, X } from 'lucide-react';

interface BulkActionsProps {
  /** Accounts on screen after filters and search. */
  visible: User[];
  /** The visible accounts that are ticked. */
  selected: User[];
  /** Showing hidden accounts: nothing here may be unfollowed in bulk. */
  hiddenMode: boolean;
}

/**
 * One bar above the list: tick-all on the left, copy and unfollow on the right.
 * While a batch runs, its progress takes the bar's place.
 */
export default function BulkActions({ visible, selected, hiddenMode }: BulkActionsProps) {
  const { t } = useTranslation();
  const setSelected = useMainStore(state => state.setSelected);
  const clearSelection = useMainStore(state => state.clearSelection);
  const { bulkState } = useRateLimitedUnfollow();
  const allSelected = visible.length > 0 && selected.length === visible.length;
  const targets = selected.length > 0 ? selected : visible;

  if (bulkState) return <BulkProgress />;

  return (
    <div className="flex min-h-9 items-center gap-2">
      {!hiddenMode && (
        <label className="flex min-w-0 cursor-pointer items-center gap-3 pl-[9px] text-sm">
          <Checkbox
            checked={allSelected}
            indeterminate={selected.length > 0 && !allSelected}
            onCheckedChange={checked =>
              checked && !allSelected
                ? setSelected(
                    visible.map(user => user.id),
                    true,
                  )
                : clearSelection()
            }
          />
          <span className="truncate text-muted-foreground">
            {selected.length > 0 ? t('selectedCount', { count: selected.length }) : t('selectAll')}
          </span>
        </label>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-1.5 px-2.5 text-muted-foreground"
          disabled={targets.length === 0}
          title={t('copyUsernames')}
          aria-label={t('copyUsernames')}
          onClick={() => copyUsernames(targets.map(user => user.username))}
        >
          <Copy className="size-3.5" />
          <span className="hidden roomy:inline">{t('copyUsernames')}</span>
        </Button>
        {!hiddenMode && <BulkUnfollow targets={targets} isSelection={selected.length > 0} />}
      </div>
    </div>
  );
}

function BulkProgress() {
  const { t } = useTranslation();
  const { cancelBulk, bulkState } = useRateLimitedUnfollow();
  const now = useNow(Boolean(bulkState?.restingUntil));
  if (!bulkState) return null;

  const percent = bulkState.total > 0 ? Math.round((bulkState.done / bulkState.total) * 100) : 0;
  const resting = bulkState.restingUntil && bulkState.restingUntil > now ? bulkState.restingUntil - now : 0;
  return (
    <div className="flex items-center gap-2 rounded border bg-muted/40 p-2">
      {resting ? <Pause className="size-4 shrink-0 text-muted-foreground" /> : <Spinner className="size-4 shrink-0" />}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{t('bulkUnfollowing', { done: bulkState.done, total: bulkState.total })}</p>
        {resting > 0 && (
          <p className="text-xs text-muted-foreground">{t('bulkResting', { time: formatDuration(resting) })}</p>
        )}
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
      <Button variant="outline" size="sm" className="shrink-0" onClick={cancelBulk}>
        <X className="size-3" />
        {t('cancel')}
      </Button>
    </div>
  );
}

function BulkUnfollow({ targets, isSelection }: { targets: User[]; isSelection: boolean }) {
  const { t } = useTranslation();
  const hasInstagramTab = useMainStore(state => state.hasInstagramTab);
  const blockedUntil = useMainStore(state => state.blockedUntil);
  const pacing = useMainStore(state => state.unfollowPacing);
  const scanning = useMainStore(state => state.scanning);
  const { startBulk } = useRateLimitedUnfollow();

  if (!hasInstagramTab) return null;

  const isBlocked = typeof blockedUntil === 'number' && blockedUntil > Date.now();
  const count = targets.length;
  const paceValues = {
    min: Math.round(pacing.gapMinMs / 1000),
    max: Math.round(pacing.gapMaxMs / 1000),
    every: pacing.pauseEvery,
    rest: Math.round(pacing.pauseMs / 60_000),
  };
  const paceNote =
    pacing.pauseEvery > 0 && pacing.pauseMs > 0
      ? t('unfollowPacingNote', paceValues)
      : t('unfollowPacingNoteNoRest', paceValues);

  return (
    <AlertDialog>
      <AlertDialogTrigger
        disabled={isBlocked || scanning || count === 0}
        render={<Button variant="outline" size="sm" className="h-9 gap-1.5 px-3" />}
      >
        <UserX className="size-3.5" />
        <span className="roomy:hidden">{t('unfollowCount', { count })}</span>
        <span className="hidden roomy:inline">
          {isSelection ? t('unfollowSelected', { count }) : t('unfollowAll', { count })}
        </span>
      </AlertDialogTrigger>
      <AlertDialogPopup>
        <AlertDialogHeader>
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive ring-1 ring-inset ring-destructive/20">
            <UserX className="size-6" strokeWidth={1.75} />
          </div>
          <AlertDialogTitle>
            {isSelection ? t('unfollowSelectedTitle', { count }) : t('unfollowAllTitle')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isSelection ? t('unfollowSelectedDescription', { count }) : t('unfollowAllDescription', { count })}{' '}
            {paceNote}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" />}>{t('cancel')}</AlertDialogClose>
          <AlertDialogClose render={<Button variant="destructive" />} onClick={() => startBulk(targets)}>
            {isSelection ? t('unfollowSelected', { count }) : t('unfollowAllAction')}
          </AlertDialogClose>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

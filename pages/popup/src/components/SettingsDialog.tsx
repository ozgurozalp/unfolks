import { useState } from 'react';
import {
  DEFAULT_SCAN_SPEED,
  DEFAULT_UNFOLLOW_PACING,
  normalizeUnfollowPacing,
  resolveScanSpeed,
  SCAN_SPEEDS,
  type ScanSpeed,
  type UnfollowPacing,
} from '@extension/shared';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
  Button,
  cn,
  Input,
  RadioGroup,
  RadioGroupItem,
} from '@extension/ui';
import { useMainStore } from '@src/store';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Settings2 } from 'lucide-react';

const SPEED_LABELS: Record<ScanSpeed, { label: string; hint: string }> = {
  fast: { label: 'scanSpeedFast', hint: 'scanSpeedFastHint' },
  balanced: { label: 'scanSpeedBalanced', hint: 'scanSpeedBalancedHint' },
  careful: { label: 'scanSpeedCareful', hint: 'scanSpeedCarefulHint' },
};

/** The form edits seconds and minutes; the store keeps milliseconds. */
interface Draft {
  speed: ScanSpeed;
  gapMinSec: string;
  gapMaxSec: string;
  pauseEvery: string;
  pauseMin: string;
}

function toDraft(speed: ScanSpeed, pacing: UnfollowPacing): Draft {
  return {
    speed,
    gapMinSec: String(pacing.gapMinMs / 1000),
    gapMaxSec: String(pacing.gapMaxMs / 1000),
    pauseEvery: String(pacing.pauseEvery),
    pauseMin: String(pacing.pauseMs / 60_000),
  };
}

/** A blank field means "use the default", not 0 (which would turn the rest off). */
function fieldValue(value: string, scale: number): number | undefined {
  return value.trim() === '' ? undefined : Number(value) * scale;
}

function fromDraft(draft: Draft): UnfollowPacing {
  return normalizeUnfollowPacing({
    gapMinMs: fieldValue(draft.gapMinSec, 1000),
    gapMaxMs: fieldValue(draft.gapMaxSec, 1000),
    pauseEvery: fieldValue(draft.pauseEvery, 1),
    pauseMs: fieldValue(draft.pauseMin, 60_000),
  });
}

interface SettingsDialogProps {
  className?: string;
  showLabel?: boolean;
}

export default function SettingsDialog({ className, showLabel = false }: SettingsDialogProps) {
  const { t } = useTranslation();
  const scanSpeed = useMainStore(state => state.scanSpeed);
  const unfollowPacing = useMainStore(state => state.unfollowPacing);
  const setPacing = useMainStore(state => state.setPacing);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => toDraft(scanSpeed, unfollowPacing));

  const update = (patch: Partial<Draft>) => setDraft(current => ({ ...current, ...patch }));

  const save = () => {
    const pacing = fromDraft(draft);
    setPacing(draft.speed, pacing);
    setDraft(toDraft(draft.speed, pacing));
    setOpen(false);
    toast.success(t('settingsSaved'), { id: 'settings-saved', position: 'bottom-center' });
  };

  const numberField = (key: keyof Omit<Draft, 'speed'>, label: string, step: string) => (
    <div className="grid gap-1 text-xs text-muted-foreground">
      <label htmlFor={`settings-${key}`}>{label}</label>
      <Input
        id={`settings-${key}`}
        type="number"
        inputMode="decimal"
        min={0}
        step={step}
        value={draft[key]}
        onChange={event => update({ [key]: event.target.value })}
        className="h-9 text-sm text-foreground"
        style={{ boxShadow: 'none' }}
      />
    </div>
  );

  return (
    <AlertDialog
      open={open}
      onOpenChange={next => {
        if (next) setDraft(toDraft(scanSpeed, unfollowPacing));
        setOpen(next);
      }}
    >
      <Button
        type="button"
        variant={showLabel ? 'ghost' : 'outline'}
        size={showLabel ? 'sm' : 'icon'}
        className={cn(showLabel ? 'gap-1.5' : 'size-10 shrink-0', className)}
        aria-label={t('settings')}
        title={t('settings')}
        onClick={() => {
          setDraft(toDraft(scanSpeed, unfollowPacing));
          setOpen(true);
        }}
      >
        <Settings2 className="size-4" />
        {showLabel && t('settings')}
      </Button>
      <AlertDialogPopup>
        <div className="max-h-[80dvh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settingsTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('settingsDescription')}</AlertDialogDescription>
          </AlertDialogHeader>

          <div className="mt-4">
            <p id="scan-speed-label" className="mb-2 text-sm font-medium">
              {t('scanSpeed')}
            </p>
            <RadioGroup
              aria-labelledby="scan-speed-label"
              value={draft.speed}
              onValueChange={value => update({ speed: resolveScanSpeed(value) })}
            >
              {SCAN_SPEEDS.map(speed => (
                <label
                  key={speed}
                  htmlFor={`scan-speed-${speed}`}
                  className={cn(
                    'flex cursor-pointer items-start gap-2.5 rounded-md border p-2.5 text-left transition-colors',
                    draft.speed === speed ? 'border-primary bg-primary/5' : 'hover:bg-accent',
                  )}
                >
                  <RadioGroupItem id={`scan-speed-${speed}`} value={speed} className="mt-0.5" />
                  <span className="grid text-sm font-medium">
                    {t(SPEED_LABELS[speed].label)}
                    <span className="text-xs font-normal text-muted-foreground">{t(SPEED_LABELS[speed].hint)}</span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          </div>

          <fieldset className="mt-4">
            <legend className="mb-2 text-sm font-medium">{t('unfollowPacingTitle')}</legend>
            <div className="grid grid-cols-2 items-end gap-2">
              {numberField('gapMinSec', t('unfollowGapMin'), '0.5')}
              {numberField('gapMaxSec', t('unfollowGapMax'), '0.5')}
              {numberField('pauseEvery', t('unfollowPauseEvery'), '1')}
              {numberField('pauseMin', t('unfollowPauseMinutes'), '0.5')}
            </div>
          </fieldset>

          <Button
            type="button"
            variant="link"
            size="sm"
            className="mt-2 h-auto px-0 text-muted-foreground"
            onClick={() => setDraft(toDraft(DEFAULT_SCAN_SPEED, DEFAULT_UNFOLLOW_PACING))}
          >
            {t('restoreDefaults')}
          </Button>

          <AlertDialogFooter className="mt-4">
            <AlertDialogClose render={<Button variant="outline" />}>{t('cancel')}</AlertDialogClose>
            <Button type="button" onClick={save}>
              {t('save')}
            </Button>
          </AlertDialogFooter>
        </div>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

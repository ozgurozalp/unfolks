import { useDeferredValue, useMemo, useRef, useState, type DragEvent } from 'react';
import { analyzeInstagramExport, ExportError, type ExportFile, type ExportResult } from '@extension/shared';
import { Button, cn, Input, Spinner } from '@extension/ui';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { ArrowLeft, Copy, ExternalLink, FileArchive, ShieldCheck, Upload } from 'lucide-react';
import openWindow from '@src/helpers/openWindow';
import copyUsernames from '@src/helpers/copyUsernames';

const DOWNLOAD_INFO_URL = 'https://accountscenter.instagram.com/info_and_permissions/dyi/';

type ExportState =
  | { status: 'idle' }
  | { status: 'reading' }
  | { status: 'done'; result: ExportResult }
  | { status: 'error'; message: string };

function toExportFiles(list: FileList | null): ExportFile[] {
  return Array.from(list ?? []).map(file => ({ path: file.webkitRelativePath || file.name, blob: file }));
}

interface ExportViewProps {
  onBack: () => void;
}

/**
 * Finds non-followers from Instagram's own data download. Everything happens in
 * this panel; no request goes to Instagram, so there is nothing to rate-limit.
 */
export default function ExportView({ onBack }: ExportViewProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<ExportState>({ status: 'idle' });
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const analyze = async (files: ExportFile[]) => {
    if (files.length === 0) return;
    setState({ status: 'reading' });
    try {
      setState({ status: 'done', result: await analyzeInstagramExport(files) });
    } catch (error) {
      const key = error instanceof ExportError ? `exportError_${error.code}` : 'exportError_unknown';
      if (!(error instanceof ExportError)) console.error('Export analysis failed', error);
      setState({ status: 'error', message: t(key) });
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void analyze(toExportFiles(event.dataTransfer.files));
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="grid gap-4"
    >
      <div className="flex items-center gap-2 border-b pb-3">
        <Button variant="ghost" size="sm" className="size-9 p-0" onClick={onBack} aria-label={t('back')}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-base font-semibold">{t('exportTitle')}</h1>
      </div>

      {state.status === 'done' ? (
        <ExportResults result={state.result} onReset={() => setState({ status: 'idle' })} />
      ) : (
        <>
          <p className="flex gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
            {t('exportIntro')}
          </p>
          <ol className="grid gap-2 text-sm">
            {[t('exportStep1'), t('exportStep2'), t('exportStep3')].map((step, index) => (
              <li key={step} className="flex gap-3 rounded-lg border bg-muted/30 p-2.5">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <Button variant="outline" onClick={() => openWindow(DOWNLOAD_INFO_URL)}>
            <ExternalLink className="size-4" />
            {t('exportLink')}
          </Button>

          <div
            onDragOver={event => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              'grid justify-items-center gap-3 rounded-xl border-2 border-dashed p-6 text-center transition-colors',
              dragging ? 'border-primary bg-primary/5' : 'border-border',
            )}
          >
            {state.status === 'reading' ? (
              <>
                <Spinner className="size-6" />
                <p className="text-sm text-muted-foreground">{t('exportReading')}</p>
              </>
            ) : (
              <>
                <FileArchive className="size-8 text-muted-foreground" strokeWidth={1.5} />
                <p className="text-sm text-muted-foreground">{t('exportDrop')}</p>
                <Button size="sm" onClick={() => inputRef.current?.click()}>
                  <Upload className="size-4" />
                  {t('exportChoose')}
                </Button>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".zip,.json,.html,application/zip,application/json,text/html"
              className="hidden"
              onChange={event => {
                void analyze(toExportFiles(event.target.files));
                event.target.value = '';
              }}
            />
          </div>
          {state.status === 'error' && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {state.message}
            </p>
          )}
        </>
      )}
    </motion.div>
  );
}

function ExportResults({ result, onReset }: { result: ExportResult; onReset: () => void }) {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState('');
  const query = useDeferredValue(search).trim().toLowerCase();
  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { year: 'numeric', month: 'short', day: 'numeric' }),
    [i18n.language],
  );
  const accounts = useMemo(
    () => (query ? result.nonFollowers.filter(account => account.username.includes(query)) : result.nonFollowers),
    [result.nonFollowers, query],
  );

  return (
    <div className="grid gap-3">
      <div>
        <p className="text-lg font-semibold">{t('exportResult', { count: result.nonFollowers.length })}</p>
        <p className="text-xs text-muted-foreground">
          {t('exportCounts', { followers: result.followersCount, following: result.followingCount })}
        </p>
      </div>
      {result.nonFollowers.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('exportNone')}</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{t('exportNote')}</p>
          <div className="flex items-center gap-2">
            <Input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder={t('searchAccountPlaceholder')}
              aria-label={t('searchAccountPlaceholder')}
              className="min-w-0 flex-1"
              style={{ boxShadow: 'none' }}
            />
            <Button
              variant="outline"
              size="sm"
              className="h-10"
              onClick={() => copyUsernames(accounts.map(a => a.username))}
            >
              <Copy className="size-3" />
              {t('copyUsernames')}
            </Button>
          </div>
          <ul className="grid gap-2">
            {accounts.map(account => (
              <li key={account.username} className="flex items-center gap-3 rounded border p-2 shadow-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{account.username}</p>
                  {account.followedAt && (
                    <p className="text-xs text-muted-foreground">
                      {t('exportFollowedOn', { date: dateFormat.format(account.followedAt) })}
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openWindow(`https://www.instagram.com/${account.username}`)}
                >
                  {t('openProfile')}
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
      <Button variant="ghost" onClick={onReset}>
        {t('exportAgain')}
      </Button>
    </div>
  );
}

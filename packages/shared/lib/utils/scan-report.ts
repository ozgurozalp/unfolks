/** Where bug reports go. */
export const REPORT_EMAIL = 'mail@ozgurozalp.com';

/** Mail apps cut long mailto links, so the body stays well under their limits. */
const MAX_REPORT_CHARS = 1600;

export interface ScanReportInput {
  version: string;
  detail?: string;
  note?: string;
  progress?: { phase: string; current: number; total: number } | null;
  lastHttp?: { status: number; message: string } | null;
  scanning: boolean;
  tabHidden: boolean;
  userAgent: string;
  log: readonly string[];
}

/** The plain-text report: what the user saw, then the scan's recent events. */
export function buildScanReport(input: ScanReportInput): string {
  const head = [
    `Unfolks v${input.version}`,
    input.note && `Message: ${input.note}`,
    input.detail && `Detail: ${input.detail}`,
    input.progress && `Position: ${input.progress.phase} ${input.progress.current}/${input.progress.total}`,
    input.lastHttp &&
      `Last HTTP: ${input.lastHttp.status}${input.lastHttp.message ? ` "${input.lastHttp.message}"` : ''}`,
    `Scanning: ${input.scanning ? 'yes' : 'no'} · tab hidden: ${input.tabHidden ? 'yes' : 'no'}`,
    `Browser: ${input.userAgent}`,
  ].filter(Boolean);

  return [...head, '', 'Recent events:', ...(input.log.length ? input.log : ['(none)'])].join('\n');
}

/** A mailto link with the report as the body. The oldest lines are dropped first when it is too long. */
export function buildReportMailto(report: string, subject = 'Unfolks error report'): string {
  let body = report;
  if (body.length > MAX_REPORT_CHARS) {
    const lines = body.split('\n');
    while (lines.length > 1 && lines.join('\n').length > MAX_REPORT_CHARS) {
      // Keep the header; the log is what grows.
      const dropAt = lines.indexOf('Recent events:') + 1 || 1;
      lines.splice(dropAt, 1);
    }
    body = lines.join('\n').slice(0, MAX_REPORT_CHARS);
  }
  return `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

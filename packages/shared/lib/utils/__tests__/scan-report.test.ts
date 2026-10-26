import { describe, expect, it } from 'vitest';
import { buildReportMailto, buildScanReport, REPORT_EMAIL } from '../scan-report';

const base = { version: '1.4.1', scanning: true, tabHidden: false, userAgent: 'UA', log: [] as string[] };

describe('scan report', () => {
  it('lists the position, last HTTP answer and the log', () => {
    const report = buildScanReport({
      ...base,
      detail: 'v1.4.1 · following 10/20',
      progress: { phase: 'following', current: 10, total: 20 },
      lastHttp: { status: 429, message: 'wait' },
      log: ['12:00:00 HTTP 429 "wait"'],
    });
    expect(report).toContain('Position: following 10/20');
    expect(report).toContain('Last HTTP: 429 "wait"');
    expect(report).toContain('12:00:00 HTTP 429');
  });

  it('says so when there are no events', () => {
    expect(buildScanReport(base)).toContain('(none)');
  });

  it('puts the report in a mailto link to the developer', () => {
    const url = buildReportMailto('hello world');
    expect(url.startsWith(`mailto:${REPORT_EMAIL}?subject=`)).toBe(true);
    expect(decodeURIComponent(url.split('body=')[1])).toBe('hello world');
  });

  it('drops the oldest events first when the report is too long', () => {
    const log = Array.from({ length: 200 }, (_, i) => `line ${i} ${'x'.repeat(30)}`);
    const body = decodeURIComponent(buildReportMailto(buildScanReport({ ...base, log })).split('body=')[1]);
    expect(body.length).toBeLessThanOrEqual(1600);
    expect(body).toContain('Unfolks v1.4.1');
    expect(body).toContain('line 199');
    expect(body).not.toContain('line 0 ');
  });
});

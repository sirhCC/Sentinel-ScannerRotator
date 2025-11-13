import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('issues provider: github', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    // @ts-expect-error: mocking global fetch for tests
    global.fetch = vi.fn(async (url: string, init: any) => {
      if (typeof url === 'string' && url.includes('/repos/') && init?.method === 'POST') {
        return {
          ok: true,
          status: 201,
          async json() {
            return { number: 123, html_url: 'https://github.com/owner/repo/issues/123' };
          },
          async text() {
            return '';
          },
        } as any;
      }
      return {
        ok: false,
        status: 404,
        async json() {
          return {};
        },
        async text() {
          return 'not found';
        },
      } as any;
    });
  });
  afterEach(() => {
    (global as any).fetch = originalFetch as any;
  });

  it('creates a single aggregated issue', async () => {
    const { createIssues } = await import('../src/issues');
    const findings = [
      {
        filePath: 'a.txt',
        line: 1,
        column: 1,
        match: 'AKIAABCDEFGHIJKLMNOP',
        severity: 'high',
        ruleName: 'AWS Access Key ID',
      },
      {
        filePath: 'b.txt',
        line: 2,
        column: 1,
        match: 'ghp_XXX',
        severity: 'high',
        ruleName: 'GitHub Token',
      },
    ];
    const res: any = await createIssues(findings as any, {
      provider: 'github',
      repo: 'owner/repo',
      minSeverity: 'medium',
    });
    expect(res.provider).toBe('github');
    expect(res.created).toBe(1);
    expect(res.number).toBe(123);
  });
});

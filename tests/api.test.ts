import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../api/questions';

const CSV = 'Question,Answer\nQ,A\n';

function stubFetch(body: string, status = 200) {
  const fn = vi.fn(async (_url: string) => new Response(body, { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

beforeEach(() => { delete process.env.SHEET_CSV_URL; });
afterEach(() => vi.unstubAllGlobals());

describe('GET /api/questions', () => {
  it('answers 503 when no sheet is configured', async () => {
    expect((await GET()).status).toBe(503);
  });

  it('returns the sheet as cacheable CSV', async () => {
    process.env.SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-abc/pub?output=csv';
    const fetchMock = stubFetch(CSV);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('cache-control')).toContain('s-maxage=60');
    expect(await res.text()).toBe(CSV);
    expect(fetchMock.mock.calls[0][0]).toBe('https://docs.google.com/spreadsheets/d/e/2PACX-abc/pub?output=csv'); // used as-is
  });

  it('turns a normal sheet link into a CSV export link, keeping the tab', async () => {
    process.env.SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1AbC_-xyz/edit?usp=sharing#gid=987';
    const fetchMock = stubFetch(CSV);
    await GET();
    expect(fetchMock.mock.calls[0][0]).toBe('https://docs.google.com/spreadsheets/d/1AbC_-xyz/export?format=csv&gid=987');
  });

  it('defaults to the first tab', async () => {
    process.env.SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1AbC/edit';
    const fetchMock = stubFetch(CSV);
    await GET();
    expect(fetchMock.mock.calls[0][0]).toBe('https://docs.google.com/spreadsheets/d/1AbC/export?format=csv&gid=0');
  });

  it('answers 502 with a hint when a private sheet returns a login page', async () => {
    process.env.SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1AbC/edit';
    stubFetch('<!DOCTYPE html><html>Sign in</html>');
    const res = await GET();
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain('Anyone with the link');
  });

  it('answers 502 when the upstream fails or is unreachable', async () => {
    process.env.SHEET_CSV_URL = 'https://example.com/q.csv';
    stubFetch('nope', 500);
    expect((await GET()).status).toBe(502);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('boom'); }));
    const res = await GET();
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('boom');
  });
});

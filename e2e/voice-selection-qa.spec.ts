import { test, expect, Page, Route } from '@playwright/test';

/** QA extra cases for the reading voice selection. speechSynthesis is faked. */

interface FakeVoice { name: string; lang: string; voiceURI: string; localService: boolean }
const voice = (name: string, lang: string, localService = false, voiceURI = `uri:${name}`): FakeVoice => ({ name, lang, voiceURI, localService });

const VOICES = [
  voice('Google US English', 'en-US'),
  voice('Google español', 'es-ES'),
  voice('Microsoft Helena', 'es-ES', true)
];

const json = (route: Route, body: unknown) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

interface SetupOptions {
  /** Utterances finish by themselves; by default they never do (long reading). */
  endUtterances?: boolean;
  /** The browser has no speechSynthesis at all. */
  noSpeech?: boolean;
}

/**
 * Mocks the backend and fakes speechSynthesis in a single init script (Playwright does not define
 * the order of several init scripts). Besides the fake, the page gets:
 * - `__fireStale()`: like Chrome, cancel() leaves late "error"/"end" events for the cancelled
 *   utterances; they are queued and only fired by this call, which returns how many there were.
 * - `__fireVoices(v)`: voices that arrive late, announced with `voiceschanged`.
 */
async function setup(page: Page, voices: FakeVoice[], settings: object, opts: SetupOptions = {}) {
  await page.route(u => !['localhost', '127.0.0.1'].includes(u.hostname), route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'noembed.com') return json(route, { title: 'Fake', author_name: 'x', author_url: 'https://example.com' });
    return route.abort();
  });
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    return json(route, url.pathname === '/api/config' ? { serviceWorker: false } : {});
  });
  await page.addInitScript(({ voices, settings, opts }) => {
    if (!localStorage.getItem('yt-notetaker-settings')) localStorage.setItem('yt-notetaker-settings', JSON.stringify(settings));
    const w = window as any;
    w.__spoken = []; w.__cancels = 0;
    const listeners: (() => void)[] = [];
    const pending: any[] = [];
    const stale: any[] = [];
    const fake = {
      getVoices: () => w.__voices ?? [],
      addEventListener: (type: string, fn: () => void) => { if (type === 'voiceschanged') listeners.push(fn); },
      removeEventListener: () => {},
      speak: (u: any) => {
        w.__spoken.push({ text: u.text, voiceURI: u.voice?.voiceURI ?? null });
        pending.push(u);
        if (opts.endUtterances) {
          setTimeout(() => {
            const i = pending.indexOf(u);
            if (i === -1) return; // cancelled meanwhile: its events are stale now
            pending.splice(i, 1);
            u.onend?.();
          }, 0);
        }
      },
      cancel: () => { w.__cancels++; stale.push(...pending.splice(0)); },
      pause: () => {}, resume: () => {}
    };
    w.__fireStale = () => {
      const old = stale.splice(0);
      old.forEach(u => { u.onerror?.(); u.onend?.(); });
      return old.length;
    };
    w.__fireVoices = (v: unknown) => { w.__voices = v; listeners.forEach(fn => fn()); };
    w.SpeechSynthesisUtterance = class { voice: any = null; lang = ''; onend: any; onerror: any; constructor(public text: string) {} };
    Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
    w.__voices = voices;
    if (opts.noSpeech) delete w.speechSynthesis;
  }, { voices, settings, opts });
}

const spoken = (page: Page) => page.evaluate(() => (window as any).__spoken as { text: string; voiceURI: string | null }[]);
const cancels = (page: Page) => page.evaluate(() => (window as any).__cancels as number);

/** Fires the late events of the cancelled utterances; returns how many there were. */
const fireStale = (page: Page) => page.evaluate(() => (window as any).__fireStale() as number);

async function openSettings(page: Page) {
  await page.goto('/');
  await page.getByTitle('Settings').first().click();
  await expect(page.getByLabel('Reading voice')).toBeVisible();
}

test.describe('Reading voice QA', () => {
  test.use({ viewport: { width: 1440, height: 1200 } });

  test('closing the modal stops a running preview', async ({ page }) => {
    await setup(page, VOICES, { language: 'es' });
    await openSettings(page);
    await page.getByRole('button', { name: 'Test voice' }).click();
    await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
    const before = await cancels(page);
    await page.getByRole('button').filter({ has: page.locator('path[d^="M4.293 4.293"]') }).click();
    await expect(page.getByLabel('Reading voice')).toBeHidden();
    expect(await cancels(page)).toBeGreaterThan(before);
    await page.getByTitle('Settings').first().click();
    await expect(page.getByRole('button', { name: 'Test voice' })).toBeVisible();
  });

  test('changing the voice or the language while previewing stops the preview', async ({ page }) => {
    await setup(page, VOICES, { language: 'es' });
    await openSettings(page);
    await page.getByRole('button', { name: 'Test voice' }).click();
    await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
    await page.getByLabel('Reading voice').selectOption('uri:Google español');
    await expect(page.getByRole('button', { name: 'Test voice' })).toBeVisible();

    await page.getByRole('button', { name: 'Test voice' }).click();
    await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
    await page.locator('#language').selectOption('en');
    await expect(page.getByRole('button', { name: 'Test voice' })).toBeVisible();
  });

  test('preview replaces a notes reading (one owner at a time) and the notes reading uses the saved voice', async ({ page }) => {
    await setup(page, VOICES, { language: 'es', voiceURI: 'uri:Google español' });
    await page.goto('/watch?v=aaaaaaaaaaa');
    await page.getByPlaceholder('Type your thoughts here...').fill('Una nota de prueba.');
    await page.locator('app-notes').getByRole('button', { name: 'Play audio' }).or(page.locator('app-notes').getByTitle('Play')).first().click();
    await expect.poll(() => spoken(page)).toEqual([{ text: 'Una nota de prueba.', voiceURI: 'uri:Google español' }]);
    await expect(page.locator('app-notes').getByTitle('Stop')).toBeVisible();

    await page.getByTitle('Settings').first().click();
    await page.getByRole('button', { name: 'Test voice' }).click();
    // the notes reading is no longer playing (its Stop button is gone), only the preview is
    await expect(page.locator('app-notes').getByTitle('Stop')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
  });

  test('BUG? saved voice of another language than the configured one: select shows Automatic, preview must use Automatic in the language', async ({ page }) => {
    await setup(page, VOICES, { language: 'en', voiceURI: 'uri:Google español' }, { endUtterances: true });
    await openSettings(page);
    await expect(page.getByLabel('Reading voice')).toHaveValue('');
    await page.getByRole('button', { name: 'Test voice' }).click();
    await expect.poll(() => spoken(page)).toEqual([{ text: 'Hello, this is the selected voice.', voiceURI: 'uri:Google US English' }]);
  });

  test('BUG? two voices with the same voiceURI: choosing the 1st is still shown as the 1st after reload', async ({ page }) => {
    const dup = [voice('Voz A', 'es-ES', false, 'dup'), voice('Voz B', 'es-ES', false, 'dup')];
    await setup(page, dup, { language: 'es' }, { endUtterances: true });
    await openSettings(page);
    const select = page.getByLabel('Reading voice');
    await select.selectOption({ label: 'Voz A (online)' });
    await page.reload();
    await page.getByTitle('Settings').first().click();
    await expect(page.getByLabel('Reading voice').locator('option:checked')).toHaveText('Voz A (online)');
  });

  test('voices that arrive late (voiceschanged) fill the open select and keep the saved choice', async ({ page }) => {
    await setup(page, [], { language: 'es', voiceURI: 'uri:Google español' });
    await openSettings(page);
    await expect(page.getByLabel('Reading voice')).toBeDisabled();
    await expect(page.getByText('Your browser has no voices available for this language.')).toBeVisible();
    await page.evaluate((v) => (window as any).__fireVoices(v), VOICES);
    await expect(page.getByLabel('Reading voice')).toBeEnabled();
    await expect(page.getByLabel('Reading voice')).toHaveValue('uri:Google español');
    await expect(page.getByText('Your browser has no voices available for this language.')).toBeHidden();
  });

  test('without speechSynthesis at all the select is disabled with the notice', async ({ page }) => {
    await setup(page, VOICES, { language: 'es' }, { noSpeech: true });
    await page.goto('/');
    expect(await page.evaluate(() => 'speechSynthesis' in window)).toBe(false);
    await page.getByTitle('Settings').first().click();
    await expect(page.getByLabel('Reading voice')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Test voice' })).toBeDisabled();
    await expect(page.getByText('Your browser has no voices available for this language.')).toBeVisible();
  });

  test('a late error/end event of a cancelled utterance does not clear the new reading', async ({ page }) => {
    await setup(page, VOICES, { language: 'es' });
    await openSettings(page);
    await page.getByRole('button', { name: 'Test voice' }).click();
    await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
    await page.getByRole('button', { name: 'Stop' }).click();
    await page.getByRole('button', { name: 'Test voice' }).click();
    await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
    // The late events of the first (cancelled) utterance arrive while the new preview plays.
    const fired = await fireStale(page);
    expect(fired).toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
    expect((await spoken(page)).length).toBe(2);
  });

  test('stop/pause/resume of a notes reading leave state consistent and a late event of an old reading is ignored', async ({ page }) => {
    await setup(page, VOICES, { language: 'es' });
    await page.goto('/watch?v=aaaaaaaaaaa');
    await page.getByPlaceholder('Type your thoughts here...').fill('Una nota de prueba.');
    const notes = page.locator('app-notes');
    await notes.getByTitle('Play').click();
    await notes.getByTitle('Pause').click();
    await expect(notes.getByTitle('Play')).toBeVisible();
    await notes.getByTitle('Play').click(); // resume
    await expect(notes.getByTitle('Pause')).toBeVisible();
    await notes.getByTitle('Stop').click();
    await expect(notes.getByTitle('Play')).toBeVisible();
    await notes.getByTitle('Play').click(); // new reading before the old end event arrives
    await expect(notes.getByTitle('Stop')).toBeVisible();
    const fired = await fireStale(page);
    expect(fired).toBeGreaterThan(0);
    await expect(notes.getByTitle('Stop')).toBeVisible();
  });

  test('backup import with odd keys: settings are never overwritten', async ({ page }) => {
    await setup(page, VOICES, { language: 'es', voiceURI: 'uri:Google español' });
    await openSettings(page);
    const before = await page.evaluate(() => localStorage.getItem('yt-notetaker-settings'));
    const entry = '{"title":"t","notes":"n","messages":[],"lastUpdated":1,"type":"video"}';
    // Raw JSON: an object literal would turn "__proto__" into a prototype instead of an own key.
    const raw = `{"settings":${entry},"Settings":${entry},"":${entry},"__proto__":${entry},"aaaaaaaaaaa":${entry}}`;
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import Backup' }).click();
    await (await chooser).setFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(raw) });
    await expect(page.getByText(/Successfully restored \d+ sessions\./)).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('yt-notetaker-settings'))).toBe(before);
    // the app keeps working afterwards
    await page.getByLabel('Reading voice').selectOption('');
  });
});

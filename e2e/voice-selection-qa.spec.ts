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

/** `endUtterances` false = utterances never finish by themselves (long reading). */
async function setup(page: Page, voices: FakeVoice[], settings: object, endUtterances = false) {
  await page.route(u => !['localhost', '127.0.0.1'].includes(u.hostname), route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'noembed.com') return json(route, { title: 'Fake', author_name: 'x', author_url: 'https://example.com' });
    return route.abort();
  });
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    return json(route, url.pathname === '/api/config' ? { serviceWorker: false } : {});
  });
  await page.addInitScript(({ voices, settings, endUtterances }) => {
    if (!localStorage.getItem('yt-notetaker-settings')) localStorage.setItem('yt-notetaker-settings', JSON.stringify(settings));
    const w = window as any;
    w.__spoken = []; w.__cancels = 0;
    const listeners: (() => void)[] = [];
    const fake = {
      getVoices: () => w.__voices ?? [],
      addEventListener: (type: string, fn: () => void) => { if (type === 'voiceschanged') listeners.push(fn); },
      removeEventListener: () => {},
      speak: (u: any) => {
        w.__spoken.push({ text: u.text, voiceURI: u.voice?.voiceURI ?? null });
        if (endUtterances) setTimeout(() => u.onend?.(), 0);
      },
      cancel: () => { w.__cancels++; },
      pause: () => {}, resume: () => {}
    };
    w.SpeechSynthesisUtterance = class { voice: any = null; lang = ''; onend: any; onerror: any; constructor(public text: string) {} };
    Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
    w.__voices = voices;
  }, { voices, settings, endUtterances });
}

const spoken = (page: Page) => page.evaluate(() => (window as any).__spoken as { text: string; voiceURI: string | null }[]);
const cancels = (page: Page) => page.evaluate(() => (window as any).__cancels as number);

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
    await setup(page, VOICES, { language: 'en', voiceURI: 'uri:Google español' }, true);
    await openSettings(page);
    await expect(page.getByLabel('Reading voice')).toHaveValue('');
    await page.getByRole('button', { name: 'Test voice' }).click();
    await expect.poll(() => spoken(page)).toEqual([{ text: 'Hello, this is the selected voice.', voiceURI: 'uri:Google US English' }]);
  });

  test('BUG? two voices with the same voiceURI: choosing the 1st is still shown as the 1st after reload', async ({ page }) => {
    const dup = [voice('Voz A', 'es-ES', false, 'dup'), voice('Voz B', 'es-ES', false, 'dup')];
    await setup(page, dup, { language: 'es' }, true);
    await openSettings(page);
    const select = page.getByLabel('Reading voice');
    await select.selectOption({ label: 'Voz A' });
    await page.reload();
    await page.getByTitle('Settings').first().click();
    await expect(page.getByLabel('Reading voice').locator('option:checked')).toHaveText('Voz A');
  });

  test('voices that arrive late (voiceschanged) fill the open select and keep the saved choice', async ({ page }) => {
    await setup(page, [], { language: 'es', voiceURI: 'uri:Google español' });
    await page.addInitScript(() => {
      const w = window as any;
      const fake = window.speechSynthesis as any;
      const orig = fake.addEventListener;
      const ls: (() => void)[] = [];
      fake.addEventListener = (t: string, fn: () => void) => { if (t === 'voiceschanged') ls.push(fn); orig(t, fn); };
      w.__fire = (v: unknown) => { w.__voices = v; ls.forEach(f => f()); };
    });
    await openSettings(page);
    await expect(page.getByLabel('Reading voice')).toBeDisabled();
    await expect(page.getByText('Your browser has no voices available for this language.')).toBeVisible();
    await page.evaluate((v) => (window as any).__fire(v), VOICES);
    await expect(page.getByLabel('Reading voice')).toBeEnabled();
    await expect(page.getByLabel('Reading voice')).toHaveValue('uri:Google español');
    await expect(page.getByText('Your browser has no voices available for this language.')).toBeHidden();
  });

  test('without speechSynthesis at all the select is disabled with the notice', async ({ page }) => {
    await setup(page, VOICES, { language: 'es' });
    await page.addInitScript(() => { delete (window as any).speechSynthesis; });
    await page.goto('/');
    expect(await page.evaluate(() => 'speechSynthesis' in window)).toBe(false);
    await page.getByTitle('Settings').first().click();
    await expect(page.getByLabel('Reading voice')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Test voice' })).toBeDisabled();
    await expect(page.getByText('Your browser has no voices available for this language.')).toBeVisible();
  });

  test('a late error/end event of a cancelled utterance does not clear the new reading', async ({ page }) => {
    await setup(page, VOICES, { language: 'es' });
    // Like Chrome: cancel() fires an asynchronous "error" (canceled) on the pending utterances.
    await page.addInitScript(() => {
      const fake = window.speechSynthesis as any;
      const pending: any[] = [];
      const speak = fake.speak;
      fake.speak = (u: any) => { pending.push(u); speak(u); };
      const cancel = fake.cancel;
      fake.cancel = () => {
        cancel();
        const old = pending.splice(0);
        setTimeout(() => old.forEach(u => { u.onerror?.(); u.onend?.(); }), 400);
      };
    });
    await openSettings(page);
    await page.getByRole('button', { name: 'Test voice' }).click();
    await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
    await page.getByRole('button', { name: 'Stop' }).click();
    await page.getByRole('button', { name: 'Test voice' }).click();
    await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
    await page.waitForTimeout(800); // the late events of the first utterance have fired by now
    await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
    expect((await spoken(page)).length).toBe(2);
  });

  test('stop/pause/resume of a notes reading leave state consistent and a late event of an old reading is ignored', async ({ page }) => {
    await setup(page, VOICES, { language: 'es' });
    await page.addInitScript(() => {
      const fake = window.speechSynthesis as any;
      const pending: any[] = [];
      const speak = fake.speak;
      fake.speak = (u: any) => { pending.push(u); speak(u); };
      const cancel = fake.cancel;
      fake.cancel = () => { cancel(); const old = pending.splice(0); setTimeout(() => old.forEach(u => u.onend?.()), 300); };
    });
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
    await page.waitForTimeout(700);
    await expect(notes.getByTitle('Stop')).toBeVisible();
  });
});

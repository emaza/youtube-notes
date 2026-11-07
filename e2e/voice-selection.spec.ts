import { test, expect, Page, Route } from '@playwright/test';

/**
 * Settings modal: choosing the reading voice. speechSynthesis is faked (no real audio, and
 * the voices installed on the machine do not matter); the backend is mocked too.
 */

interface FakeVoice {
  name: string;
  lang: string;
  voiceURI: string;
  localService: boolean;
}

const voice = (name: string, lang: string, localService = false): FakeVoice => ({ name, lang, voiceURI: `uri:${name}`, localService });

const VOICES = [
  voice('Google US English', 'en-US'),
  voice('Google español', 'es-ES'),
  voice('Google español de Estados Unidos', 'es-US'),
  voice('Microsoft Helena', 'es-ES', true)
];

const json = (route: Route, body: unknown) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

interface Spoken {
  text: string;
  voiceURI: string | null;
}

async function setup(page: Page, voices: FakeVoice[], settings: object = { language: 'es' }) {
  await page.route(u => !['localhost', '127.0.0.1'].includes(u.hostname), route => route.abort());
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    return json(route, url.pathname === '/api/config' ? { serviceWorker: false } : {});
  });

  await page.addInitScript(({ voices, settings }) => {
    if (!localStorage.getItem('yt-notetaker-settings')) {
      localStorage.setItem('yt-notetaker-settings', JSON.stringify(settings));
    }
    const w = window as any;
    w.__spoken = [];
    const listeners: (() => void)[] = [];
    const fake = {
      getVoices: () => w.__voices ?? [],
      addEventListener: (type: string, fn: () => void) => { if (type === 'voiceschanged') listeners.push(fn); },
      removeEventListener: () => {},
      speak: (u: any) => {
        w.__spoken.push({ text: u.text, voiceURI: u.voice?.voiceURI ?? null });
        setTimeout(() => u.onend?.(), 0);
      },
      cancel: () => {},
      pause: () => {},
      resume: () => {}
    };
    // The native utterance rejects voices that are not real SpeechSynthesisVoice objects.
    w.SpeechSynthesisUtterance = class { voice: any = null; lang = ''; onend: any; onerror: any; constructor(public text: string) {} };
    Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
    // Chrome loads the voices asynchronously: they show up after the app starts.
    w.__loadVoices = () => { w.__voices = voices; listeners.forEach(fn => fn()); };
    if (voices.length) setTimeout(w.__loadVoices, 200);
  }, { voices, settings });
}

const spoken = (page: Page) => page.evaluate(() => (window as any).__spoken as Spoken[]);
const savedVoice = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('yt-notetaker-settings') ?? '{}').voiceURI as string | undefined);

async function openSettings(page: Page) {
  await page.goto('/');
  await page.getByTitle('Settings').first().click();
  await expect(page.getByLabel('Reading voice')).toBeVisible();
}

test.describe('Reading voice selection', () => {
  test.use({ viewport: { width: 1440, height: 1200 } });

  test('lists only voices of the configured language, after Automatic', async ({ page }) => {
    await setup(page, VOICES);
    await openSettings(page);
    const select = page.getByLabel('Reading voice');
    await expect(select).toBeEnabled();
    await expect(select.locator('option')).toHaveText([
      'Automatic',
      'Google español (es-ES, online)',
      'Google español de Estados Unidos (es-US, online)',
      'Microsoft Helena (es-ES)'
    ]);
    await expect(page.getByText('Your browser has no voices available for this language.')).toBeHidden();
  });

  test('choosing a voice saves it, and "Test voice" reads a Spanish phrase with it', async ({ page }) => {
    await setup(page, VOICES);
    await openSettings(page);
    await page.getByLabel('Reading voice').selectOption('uri:Google español');
    expect(await savedVoice(page)).toBe('uri:Google español');

    await page.getByRole('button', { name: 'Test voice' }).click();
    await expect.poll(() => spoken(page)).toEqual([{ text: 'Hola, esta es la voz seleccionada.', voiceURI: 'uri:Google español' }]);

    await page.reload();
    await page.getByTitle('Settings').first().click();
    await expect(page.getByLabel('Reading voice')).toHaveValue('uri:Google español');
  });

  test('Automatic prefers a local voice and clears the saved one', async ({ page }) => {
    await setup(page, VOICES, { language: 'es', voiceURI: 'uri:Google español' });
    await openSettings(page);
    const select = page.getByLabel('Reading voice');
    await expect(select).toHaveValue('uri:Google español');

    await select.selectOption('');
    expect(await savedVoice(page)).toBeUndefined();
    await page.getByRole('button', { name: 'Test voice' }).click();
    await expect.poll(async () => (await spoken(page))[0]?.voiceURI).toBe('uri:Microsoft Helena');
  });

  test('changing the language resets a voice of another language to Automatic', async ({ page }) => {
    await setup(page, VOICES, { language: 'es', voiceURI: 'uri:Google español' });
    await openSettings(page);
    // Wait for the voices: before they load, the reset would happen just because the voice is unknown.
    await expect(page.getByLabel('Reading voice')).toHaveValue('uri:Google español');
    await page.locator('#language').selectOption('en');
    await expect(page.getByLabel('Reading voice')).toHaveValue('');
    expect(await savedVoice(page)).toBeUndefined();
    await expect(page.getByLabel('Reading voice').locator('option')).toHaveText(['Automatic', 'Google US English (online)']);

    await page.getByRole('button', { name: 'Test voice' }).click();
    await expect.poll(() => spoken(page)).toEqual([{ text: 'Hello, this is the selected voice.', voiceURI: 'uri:Google US English' }]);
  });

  test('a saved voice that is gone shows Automatic and does not break reading', async ({ page }) => {
    await setup(page, VOICES, { language: 'es', voiceURI: 'uri:Removed voice' });
    await openSettings(page);
    // Enabled = the voices have loaded; before that the value is '' anyway.
    await expect(page.getByLabel('Reading voice')).toBeEnabled();
    await expect(page.getByLabel('Reading voice')).toHaveValue('');
    await page.getByRole('button', { name: 'Test voice' }).click();
    await expect.poll(async () => (await spoken(page))[0]?.voiceURI).toBe('uri:Microsoft Helena');
  });

  test('reading the notes with a saved voice that is gone falls back to the automatic voice', async ({ page }) => {
    await setup(page, VOICES, { language: 'es', voiceURI: 'uri:Removed voice' });
    await page.goto('/watch?v=aaaaaaaaaaa');
    await page.getByPlaceholder('Type your thoughts here...').fill('Una nota de prueba.');
    // The reading must find the voices loaded, so the saved (gone) voice is really looked up among them.
    await expect.poll(() => page.evaluate(() => speechSynthesis.getVoices().length)).toBe(VOICES.length);
    await page.locator('app-notes').getByTitle('Play').click();
    // Automatic for es-ES: the local voice of the exact language.
    await expect.poll(() => spoken(page)).toEqual([{ text: 'Una nota de prueba.', voiceURI: 'uri:Microsoft Helena' }]);
  });

  test('without voices for the language the select is disabled and a notice is shown', async ({ page }) => {
    await setup(page, [voice('Google US English', 'en-US')]);
    await openSettings(page);
    // The select is disabled before and after the voices load: switching to English shows them painted.
    const select = page.getByLabel('Reading voice');
    await page.locator('#language').selectOption('en');
    await expect(select).toBeEnabled();
    await expect(select.locator('option')).toHaveText(['Automatic', 'Google US English (online)']);
    await page.locator('#language').selectOption('es');
    await expect(select).toBeDisabled();
    await expect(page.getByText('Your browser has no voices available for this language.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Test voice' })).toBeDisabled();
  });

  test('remote voices are marked "online" and local ones are not', async ({ page }) => {
    await setup(page, [voice('Google español', 'es-ES'), voice('Microsoft Helena', 'es-ES', true)]);
    await openSettings(page);
    await expect(page.getByLabel('Reading voice').locator('option')).toHaveText([
      'Automatic',
      'Google español (online)',
      'Microsoft Helena'
    ]);
  });

  test('importing a backup restores only video sessions, never the settings', async ({ page }) => {
    await setup(page, VOICES, { language: 'es', voiceURI: 'uri:Google español' });
    await openSettings(page);
    const settingsBefore = await page.evaluate(() => localStorage.getItem('yt-notetaker-settings'));

    const backup = {
      // Would be written to the settings key ('yt-notetaker-' + 'settings') if it were not filtered.
      settings: { notes: 'x', language: 'en', voiceURI: 'uri:Google US English' },
      aaaaaaaaaaa: { title: 'Restored video', notes: 'Restored notes', messages: [], lastUpdated: 1, type: 'video' }
    };
    // The real flow: "Import Backup" opens the file chooser of the import input.
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import Backup' }).click();
    await (await chooser).setFiles({
      name: 'backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(backup))
    });

    await expect(page.getByText('Successfully restored 1 sessions.')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('yt-notetaker-settings'))).toBe(settingsBefore);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('yt-notetaker-aaaaaaaaaaa') ?? 'null')?.notes)).toBe('Restored notes');
  });
});

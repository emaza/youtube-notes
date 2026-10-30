import { Injectable, signal } from '@angular/core';
import { markdownToHtml } from '../utils/markdown';

// App language code (settings) -> BCP 47 tag for the speech engine.
const SPEECH_LANGS: Record<string, string> = {
  es: 'es-ES',
  en: 'en-US',
  fr: 'fr-FR',
  de: 'de-DE',
  it: 'it-IT',
  pt: 'pt-PT'
};

// Chrome stops long utterances (~15 s with remote voices), so text is read in chunks.
const MAX_CHUNK_CHARS = 200;

/** Reads text aloud with the browser's SpeechSynthesis, one owner at a time. */
@Injectable({
  providedIn: 'root'
})
export class SpeechService {
  readonly supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  /** What is being read right now (e.g. a chat message), or null. */
  readonly speaking = signal<object | null>(null);
  readonly paused = signal(false);

  async speak(owner: object, markdown: string, language: string) {
    if (!this.supported) return;
    this.stop();
    this.speaking.set(owner);

    const lang = SPEECH_LANGS[language] ?? language;
    const voice = await this.findVoice(lang);
    // Stopped or replaced while waiting for the voices to load.
    if (this.speaking() !== owner) return;

    const chunks = splitIntoChunks(markdownToText(markdown));
    if (chunks.length === 0) {
      this.speaking.set(null);
      return;
    }

    chunks.forEach((chunk, i) => {
      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.lang = lang;
      if (voice) utterance.voice = voice;
      if (i === chunks.length - 1) utterance.onend = () => this.finish(owner);
      utterance.onerror = () => this.finish(owner);
      speechSynthesis.speak(utterance);
    });
  }

  pause() {
    if (!this.supported || !this.speaking()) return;
    speechSynthesis.pause();
    this.paused.set(true);
  }

  resume() {
    if (!this.supported || !this.speaking()) return;
    speechSynthesis.resume();
    this.paused.set(false);
  }

  stop() {
    if (!this.supported) return;
    speechSynthesis.cancel();
    this.speaking.set(null);
    this.paused.set(false);
  }

  private finish(owner: object) {
    if (this.speaking() !== owner) return;
    this.speaking.set(null);
    this.paused.set(false);
  }

  /** First voice for the language, preferring local ones; voices may load asynchronously. */
  private async findVoice(lang: string): Promise<SpeechSynthesisVoice | undefined> {
    let voices = speechSynthesis.getVoices();
    if (voices.length === 0) {
      voices = await new Promise<SpeechSynthesisVoice[]>(resolve => {
        const done = () => resolve(speechSynthesis.getVoices());
        speechSynthesis.addEventListener('voiceschanged', done, { once: true });
        setTimeout(done, 1000);
      });
    }
    const base = lang.split('-')[0].toLowerCase();
    const matching = voices.filter(v => v.lang.toLowerCase().replace('_', '-').startsWith(base));
    return matching.find(v => v.lang === lang && v.localService)
      ?? matching.find(v => v.lang === lang)
      ?? matching.find(v => v.localService)
      ?? matching[0];
  }
}

/** Plain text of rendered Markdown, so symbols and link URLs aren't read aloud. */
function markdownToText(markdown: string): string {
  const el = document.createElement('div');
  el.innerHTML = markdownToHtml(markdown);
  // Keep block boundaries as line breaks so chunks split on them.
  el.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, br, tr, pre, blockquote').forEach(node => node.append('\n'));
  return el.textContent ?? '';
}

function splitIntoChunks(text: string): string[] {
  const chunks: string[] = [];
  for (const block of text.split(/\n+/).map(b => b.trim()).filter(Boolean)) {
    let current = '';
    for (const sentence of block.match(/[^.!?;:]+[.!?;:]*\s*/g) ?? [block]) {
      if (current && (current + sentence).length > MAX_CHUNK_CHARS) {
        chunks.push(current.trim());
        current = '';
      }
      current += sentence;
    }
    if (current.trim()) chunks.push(current.trim());
  }
  return chunks;
}

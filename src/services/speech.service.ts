import { Injectable, signal } from '@angular/core';
import { markdownToText, wordRangeAt } from '../utils/speech-text';

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

// CSS highlight painting the clicked word in read-only texts, which show no caret.
const START_HIGHLIGHT = 'speech-start';

/** Where the user last clicked or selected inside a readable text (`[data-speech-text]`). */
export interface SpeechStartPoint {
  el: HTMLElement;
  range: Range;
}

/** Reads text aloud with the browser's SpeechSynthesis, one owner at a time. */
@Injectable({
  providedIn: 'root'
})
export class SpeechService {
  readonly supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  /** What is being read right now (e.g. a chat message), or null. */
  readonly speaking = signal<object | null>(null);
  readonly paused = signal(false);
  /** Kept when the selection moves elsewhere (e.g. to the Play button). */
  readonly startPoint = signal<SpeechStartPoint | null>(null);

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('selectionchange', () => this.onSelectionChange());
    }
  }

  speak(owner: object, markdown: string, language: string) {
    return this.speakText(owner, markdownToText(markdown), language);
  }

  async speakText(owner: object, text: string, language: string) {
    if (!this.supported) return;
    this.stop();
    this.speaking.set(owner);

    const lang = SPEECH_LANGS[language] ?? language;
    const voice = await this.findVoice(lang);
    // Stopped or replaced while waiting for the voices to load.
    if (this.speaking() !== owner) return;

    const chunks = splitIntoChunks(text);
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

  /** Forget the start point, so the next reading starts from the beginning. */
  clearStartPoint() {
    this.startPoint.set(null);
    this.markStart(null);
  }

  private onSelectionChange() {
    const selection = document.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    const node = range.startContainer;
    const el = (node instanceof Element ? node : node.parentElement)?.closest<HTMLElement>('[data-speech-text]');
    if (!el) return;
    this.startPoint.set({ el, range: range.cloneRange() });
    // A selection is already visible; a click only gets a collapsed, invisible one.
    this.markStart(range.collapsed ? wordRangeAt(range) : null);
  }

  private markStart(word: Range | null) {
    if (typeof CSS === 'undefined' || !CSS.highlights) return;
    if (word) CSS.highlights.set(START_HIGHLIGHT, new Highlight(word));
    else CSS.highlights.delete(START_HIGHLIGHT);
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

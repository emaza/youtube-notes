import { Injectable, inject, signal } from '@angular/core';
import { StorageService } from './storage.service';
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

// Short phrase used to preview a voice, by base language (English for the rest).
const PREVIEW_PHRASES: Record<string, string> = {
  es: 'Hola, esta es la voz seleccionada.',
  en: 'Hello, this is the selected voice.',
  fr: 'Bonjour, voici la voix sélectionnée.',
  de: 'Hallo, das ist die ausgewählte Stimme.',
  it: 'Ciao, questa è la voce selezionata.',
  pt: 'Olá, esta é a voz selecionada.'
};
const DEFAULT_PREVIEW_PHRASE = 'Hello, this is the selected voice.';

/** Base language of a BCP 47 tag, e.g. `es-ES` or `es_ES` -> `es`. */
export function baseLang(lang: string): string {
  return lang.toLowerCase().replace('_', '-').split('-')[0];
}

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
  private storage = inject(StorageService);
  /** Speech owner used by voice previews (see `previewVoice`). */
  private previewOwner = {};
  /** Bumped on every stop/new reading, so late events of a cancelled utterance are ignored. */
  private session = 0;
  readonly supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  /** What is being read right now (e.g. a chat message), or null. */
  readonly speaking = signal<object | null>(null);
  readonly paused = signal(false);
  /** Kept when the selection moves elsewhere (e.g. to the Play button). */
  readonly startPoint = signal<SpeechStartPoint | null>(null);

  /** Voices installed in the browser; they load asynchronously (see `voiceschanged`). */
  readonly voices = signal<SpeechSynthesisVoice[]>([]);

  constructor() {
    if (this.supported) {
      this.voices.set(speechSynthesis.getVoices());
      speechSynthesis.addEventListener('voiceschanged', () => this.voices.set(speechSynthesis.getVoices()));
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('selectionchange', () => this.onSelectionChange());
    }
  }

  speak(owner: object, markdown: string, language: string) {
    return this.speakText(owner, markdownToText(markdown), language);
  }

  /**
   * `voiceURI` overrides the voice saved in settings; an empty string forces the automatic one.
   */
  async speakText(owner: object, text: string, language: string, voiceURI?: string) {
    if (!this.supported) return;
    this.stop();
    const session = this.session;
    this.speaking.set(owner);

    const lang = SPEECH_LANGS[language] ?? language;
    const voice = await this.findVoice(lang, voiceURI);
    // Stopped or replaced while waiting for the voices to load.
    if (this.speaking() !== owner || this.session !== session) return;

    const chunks = splitIntoChunks(text);
    if (chunks.length === 0) {
      this.speaking.set(null);
      return;
    }

    chunks.forEach((chunk, i) => {
      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.lang = lang;
      if (voice) utterance.voice = voice;
      if (i === chunks.length - 1) utterance.onend = () => this.finish(owner, session);
      utterance.onerror = () => this.finish(owner, session);
      speechSynthesis.speak(utterance);
    });
  }

  /** Reads a short test phrase with the given voice ('' = automatic) as the preview owner. */
  previewVoice(voiceURI: string, language: string) {
    const voice = this.voices().find(v => v.voiceURI === voiceURI);
    const base = voice ? baseLang(voice.lang) : baseLang(language);
    return this.speakText(this.previewOwner, PREVIEW_PHRASES[base] ?? DEFAULT_PREVIEW_PHRASE, language, voiceURI);
  }

  /** Whether a voice preview is being read right now. */
  isPreviewing() {
    return this.speaking() === this.previewOwner;
  }

  /** Stops the voice preview, leaving any other reading untouched. */
  stopPreview() {
    if (this.isPreviewing()) this.stop();
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
    this.session++;
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

  private finish(owner: object, session: number) {
    if (this.session !== session || this.speaking() !== owner) return;
    this.speaking.set(null);
    this.paused.set(false);
  }

  /**
   * The chosen voice (`voiceURI`, or the one saved in settings) if it still exists and speaks the
   * language; otherwise the first voice for the language, preferring local ones.
   * Voices may load asynchronously.
   */
  private async findVoice(lang: string, voiceURI?: string): Promise<SpeechSynthesisVoice | undefined> {
    let voices = speechSynthesis.getVoices();
    if (voices.length === 0) {
      voices = await new Promise<SpeechSynthesisVoice[]>(resolve => {
        const done = () => resolve(speechSynthesis.getVoices());
        speechSynthesis.addEventListener('voiceschanged', done, { once: true });
        setTimeout(done, 1000);
      });
    }
    const base = baseLang(lang);
    const wanted = voiceURI ?? this.storage.getAppSettings()?.voiceURI;
    const chosen = wanted ? voices.find(v => v.voiceURI === wanted && baseLang(v.lang) === base) : undefined;
    if (chosen) return chosen;

    const matching = voices.filter(v => baseLang(v.lang) === base);
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

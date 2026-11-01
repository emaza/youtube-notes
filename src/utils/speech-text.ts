import { markdownToHtml } from './markdown';

// Private-use characters marking where a slice starts and ends; Markdown keeps them as text.
const START = '\uE000';
const END = '\uE001';

// Block markers at the start of a line (headings, lists, tasks, quotes): a slice can't start
// inside them, or the line would lose its meaning (e.g. "# Title" read as a paragraph).
const LINE_PREFIX = /^[ \t]*(?:(?:#{1,6}|[-*+]|\d+[.)]|>)[ \t]+(?:\[[ xX]\][ \t]+)?)*/;

// Passage labels: first/last words shown, and the tooltip length.
const LABEL_WORDS = 3;
const LABEL_MAX_CHARS = 24;
const PREVIEW_MAX_CHARS = 200;

/** Part of a text to read aloud: from a start point to the end, or a selection. */
export interface SpeechPassage {
  text: string;
  toEnd: boolean;
}

/** Plain text of an element, keeping block boundaries as line breaks. */
export function elementToText(el: HTMLElement): string {
  el.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, br, tr, pre, blockquote').forEach(node => node.append('\n'));
  return el.textContent ?? '';
}

/** Plain text of rendered Markdown, so symbols and link URLs aren't read aloud. */
export function markdownToText(markdown: string): string {
  const el = document.createElement('div');
  el.innerHTML = markdownToHtml(markdown);
  return elementToText(el);
}

/**
 * Plain text of the Markdown between two offsets (e.g. a textarea's cursor or selection),
 * widened to whole words. Without `end`, up to the end. Null when there is nothing to read
 * from there or it's the whole text, so the caller reads the whole text.
 */
export function markdownSlice(markdown: string, start: number, end?: number): SpeechPassage | null {
  const toEnd = end === undefined;
  if (end === undefined && !markdown.slice(start).trim()) return null;
  start = afterLinePrefix(markdown, wordBounds(markdown, start)[0]);
  if (end === undefined) {
    end = markdown.length;
  } else {
    end = wordBounds(markdown, end)[1];
    // Before closing emphasis/code markers, or a mark after them stops them from closing.
    while (end > start && /[*_~`]/.test(markdown[end - 1])) end--;
  }
  if (start >= end) return null;

  const text = markdownToText(markdown.slice(0, start) + START + markdown.slice(start, end) + END + markdown.slice(end));
  const from = text.indexOf(START);
  // Lost when the cursor was inside something that isn't read (e.g. a link URL).
  if (from < 0) return null;
  const to = text.indexOf(END, from);
  const slice = text.slice(from + 1, to < 0 ? undefined : to).replaceAll(END, '');
  return toPassage(slice, toEnd, () => text.replaceAll(START, '').replaceAll(END, ''));
}

/**
 * Plain text of a DOM range inside rendered HTML: the selection, or from the caret's word
 * to the end of `container` when collapsed. Null when it isn't in `container` (e.g. the HTML
 * was rendered again), there is nothing to read or it's the whole text.
 */
export function rangeText(container: HTMLElement, range: Range): SpeechPassage | null {
  if (!container.isConnected || !container.contains(range.startContainer)) return null;
  const slice = range.cloneRange();
  if (slice.collapsed || !container.contains(slice.endContainer)) {
    slice.setEnd(container, container.childNodes.length);
    if (range.collapsed && !slice.toString().trim()) return null;
  }
  if (range.collapsed && slice.startContainer instanceof Text) {
    slice.setStart(slice.startContainer, wordBounds(slice.startContainer.data, slice.startOffset)[0]);
  }

  const el = document.createElement('div');
  el.append(slice.cloneContents());
  return toPassage(elementToText(el), range.collapsed, () => elementToText(container.cloneNode(true) as HTMLElement));
}

/**
 * Label of a passage: its first words and, for a selection, its last ones. A short selection
 * is labelled whole, in `from`, with `to` null.
 */
export function passageLabel(passage: SpeechPassage): { from: string; to: string | null } {
  const words = normalize(passage.text).split(' ');
  if (!passage.toEnd && words.length <= LABEL_WORDS * 2) return { from: shorten(words.join(' '), false), to: null };
  const more = words.length > LABEL_WORDS;
  return {
    from: shorten(words.slice(0, LABEL_WORDS).join(' '), more),
    to: passage.toEnd ? null : shorten(words.slice(-LABEL_WORDS).join(' '), more, true)
  };
}

/** Start of a passage for a tooltip. */
export function passagePreview(passage: SpeechPassage): string {
  const text = normalize(passage.text);
  return text.length > PREVIEW_MAX_CHARS ? `${text.slice(0, PREVIEW_MAX_CHARS).trimEnd()}…` : text;
}

/** Offsets of a range inside an element whose text is the raw Markdown; `end` only for a selection. */
export function rangeOffsets(container: HTMLElement, range: Range): [number, number | undefined] | null {
  if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) return null;
  const before = document.createRange();
  before.selectNodeContents(container);
  before.setEnd(range.startContainer, range.startOffset);
  const start = before.toString().length;
  return [start, range.collapsed ? undefined : start + range.toString().length];
}

/** Range of the word at a collapsed range (e.g. a click), or null on whitespace. */
export function wordRangeAt(range: Range): Range | null {
  const node = range.startContainer;
  if (!(node instanceof Text)) return null;
  const [start, end] = wordBounds(node.data, range.startOffset);
  if (start === end) return null;
  const word = document.createRange();
  word.setStart(node, start);
  word.setEnd(node, end);
  return word;
}

function wordBounds(text: string, offset: number): [number, number] {
  let start = offset;
  let end = offset;
  while (start > 0 && !/\s/.test(text[start - 1])) start--;
  while (end < text.length && !/\s/.test(text[end])) end++;
  return [start, end];
}

function afterLinePrefix(markdown: string, offset: number): number {
  const lineStart = markdown.lastIndexOf('\n', offset - 1) + 1;
  const prefix = LINE_PREFIX.exec(markdown.slice(lineStart))?.[0].length ?? 0;
  return Math.max(offset, lineStart + prefix);
}

function toPassage(text: string, toEnd: boolean, wholeText: () => string): SpeechPassage | null {
  if (!text.trim()) return null;
  // The whole text is read anyway, with no label.
  if (normalize(text) === normalize(wholeText())) return null;
  return { text, toEnd };
}

/** Cut to the label length, with an ellipsis where text is missing (at the start for `fromEnd`). */
function shorten(label: string, more: boolean, fromEnd = false): string {
  if (label.length > LABEL_MAX_CHARS) {
    label = fromEnd ? label.slice(-LABEL_MAX_CHARS).trimStart() : label.slice(0, LABEL_MAX_CHARS).trimEnd();
    more = true;
  }
  if (!more) return label;
  return fromEnd ? `…${label}` : `${label}…`;
}

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

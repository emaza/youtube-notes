import { Injectable } from '@angular/core';
import { VideoType } from './storage.service';
import { SEARCH_FILTER_KEYS, SearchFilters, parseFilters, serializeFilters } from '../utils/search';

/**
 * Keeps the open video (?v=&type=) or the active search (?q=&order=…) in the
 * browser URL and its history.
 */
@Injectable({
  providedIn: 'root'
})
export class BrowserUrlService {
  private readonly available = typeof window !== 'undefined';

  /** The video in the current URL, or null when there is none. */
  read(): { videoId: string; type: VideoType } | null {
    if (!this.available) return null;

    const params = new URLSearchParams(window.location.search);
    const videoId = params.get('v');
    if (!videoId) return null;

    const typeParam = params.get('type');
    // Validate type
    const type: VideoType = (typeParam === 'short' || typeParam === 'video') ? typeParam : 'video';
    return { videoId, type };
  }

  /** The search in the current URL, or null when there is none. */
  readSearch(): SearchFilters | null {
    if (!this.available) return null;
    return parseFilters(new URLSearchParams(window.location.search));
  }

  showVideo(videoId: string, type: VideoType) {
    if (!this.available) return;

    const url = new URL(window.location.href);
    this.deleteSearchParams(url);
    url.searchParams.set('v', videoId);
    url.searchParams.set('type', type);
    this.setBrowserUrl(url);
  }

  showSearch(filters: SearchFilters) {
    if (!this.available) return;

    const url = new URL(window.location.href);
    url.searchParams.delete('v');
    url.searchParams.delete('type');
    this.deleteSearchParams(url);
    for (const [key, value] of new URLSearchParams(serializeFilters(filters))) {
      url.searchParams.set(key, value);
    }
    this.setBrowserUrl(url);
  }

  /** Removes the video and the search from the URL. */
  clear() {
    if (!this.available) return;

    const url = new URL(window.location.href);
    url.searchParams.delete('v');
    url.searchParams.delete('type');
    this.deleteSearchParams(url);
    this.setBrowserUrl(url);
  }

  /** Back/forward: called after the browser has already changed the URL. */
  onNavigate(callback: () => void) {
    if (this.available) window.addEventListener('popstate', callback);
  }

  private deleteSearchParams(url: URL) {
    for (const key of SEARCH_FILTER_KEYS) url.searchParams.delete(key);
  }

  /**
   * Adds a history entry so back/forward work, but only when the URL actually
   * changes: on first load, after back/forward (URL already updated) or while
   * typing a partial link, nothing is pushed.
   */
  private setBrowserUrl(url: URL) {
    if (url.href === window.location.href) return;
    window.history.pushState({}, '', url.toString());
  }
}

import { Injectable } from '@angular/core';
import { VideoType } from './storage.service';
import { SearchFilters, parseFilters, serializeFilters } from '../utils/search';

// Like YouTube: a video at /watch?v=ID, a short at /shorts/ID; search and home at /.
const WATCH_PATH = '/watch';
const SHORTS_PATH_RE = /^\/shorts\/([\w-]{11})\/?$/;

/**
 * Keeps the open video (/watch?v=, /shorts/ID) or the active search (/?q=&order=…)
 * in the browser URL and its history.
 */
@Injectable({
  providedIn: 'root'
})
export class BrowserUrlService {
  private readonly available = typeof window !== 'undefined';

  /**
   * The video in the current URL, or null when there is none. Old links
   * (/?v=…&type=video|short) are rewritten to /watch or /shorts, without a new history entry.
   */
  read(): { videoId: string; type: VideoType } | null {
    if (!this.available) return null;

    const short = SHORTS_PATH_RE.exec(window.location.pathname);
    const params = new URLSearchParams(window.location.search);
    const videoId = short?.[1] ?? params.get('v');
    if (!videoId) return null;

    const type: VideoType = short || params.get('type') === 'short' ? 'short' : 'video';
    const canonical = this.videoUrl(videoId, type);
    if (canonical.href !== window.location.href) window.history.replaceState(window.history.state, '', canonical);
    return { videoId, type };
  }

  /** The search in the current URL, or null when there is none. */
  readSearch(): SearchFilters | null {
    if (!this.available) return null;
    return parseFilters(new URLSearchParams(window.location.search));
  }

  showVideo(videoId: string, type: VideoType) {
    if (!this.available) return;
    this.setBrowserUrl(this.videoUrl(videoId, type));
  }

  showSearch(filters: SearchFilters) {
    if (!this.available) return;

    const url = this.homeUrl();
    url.search = serializeFilters(filters);
    this.setBrowserUrl(url);
  }

  /** Removes the video and the search from the URL. */
  clear() {
    if (!this.available) return;
    this.setBrowserUrl(this.homeUrl());
  }

  /** Back/forward: called after the browser has already changed the URL. */
  onNavigate(callback: () => void) {
    if (this.available) window.addEventListener('popstate', callback);
  }

  private videoUrl(videoId: string, type: VideoType): URL {
    if (type === 'short') return new URL(`/shorts/${encodeURIComponent(videoId)}`, window.location.origin);
    const url = new URL(WATCH_PATH, window.location.origin);
    url.searchParams.set('v', videoId);
    return url;
  }

  private homeUrl(): URL {
    return new URL('/', window.location.origin);
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

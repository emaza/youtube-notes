import { Injectable } from '@angular/core';
import { VideoType } from './storage.service';

/** Keeps the open video in the browser URL (?v=&type=) and its history. */
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

  showVideo(videoId: string, type: VideoType) {
    if (!this.available) return;

    const url = new URL(window.location.href);
    url.searchParams.set('v', videoId);
    url.searchParams.set('type', type);
    this.setBrowserUrl(url);
  }

  clear() {
    if (!this.available) return;

    const url = new URL(window.location.href);
    url.searchParams.delete('v');
    url.searchParams.delete('type');
    this.setBrowserUrl(url);
  }

  /** Back/forward: called after the browser has already changed the URL. */
  onNavigate(callback: () => void) {
    if (this.available) window.addEventListener('popstate', callback);
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

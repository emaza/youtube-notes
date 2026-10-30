import { Injectable, inject, signal } from '@angular/core';
import { StorageService } from './storage.service';
import type { SearchPage } from './youtube-search.service';

interface CachedSearch {
  lastUsed: number;
  /**
   * Pages already fetched, by page number. Not by page token: YouTube gives the
   * same page a different token going forward (nextPageToken) than going back
   * (prevPageToken).
   */
  pages: Record<string, SearchPage>;
}

// Must not start with 'yt-notetaker-': StorageService treats that prefix as saved
// sessions (session list and backup), and the cache must stay out of both.
const CACHE_KEY = 'yt-search-cache';
export const DEFAULT_SEARCH_CACHE_SIZE = 20;
export const MAX_SEARCH_CACHE_SIZE = 200;

/**
 * Search results kept in localStorage, keyed by the search's URL query string,
 * so back/forward and reloads don't spend YouTube API quota (100 units each).
 * Least recently used searches are dropped beyond the configured maximum.
 */
@Injectable({
  providedIn: 'root'
})
export class SearchCacheService {
  private storageService = inject(StorageService);

  maxSearches = signal(DEFAULT_SEARCH_CACHE_SIZE);
  count = signal(0);

  constructor() {
    const saved = this.storageService.getAppSettings()?.searchCacheSize;
    if (typeof saved === 'number') this.maxSearches.set(clampSize(saved));
    this.count.set(Object.keys(this.read()).length);
  }

  get(searchKey: string, pageNumber: number): SearchPage | null {
    const entries = this.read();
    const page = entries[searchKey]?.pages[pageNumber];
    if (!page) return null;
    entries[searchKey].lastUsed = Date.now();
    this.write(entries);
    return page;
  }

  put(searchKey: string, pageNumber: number, page: SearchPage) {
    if (this.maxSearches() === 0) return;
    const entries = this.read();
    const entry = entries[searchKey] ?? { lastUsed: 0, pages: {} };
    entry.lastUsed = Date.now();
    entry.pages[pageNumber] = page;
    entries[searchKey] = entry;
    this.write(entries);
  }

  setMaxSearches(size: number) {
    this.maxSearches.set(clampSize(size));
    this.storageService.saveAppSettings({ searchCacheSize: this.maxSearches() });
    this.write(this.read());
  }

  clear() {
    localStorage.removeItem(CACHE_KEY);
    this.count.set(0);
  }

  private read(): Record<string, CachedSearch> {
    try {
      const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  /** Saves the newest `maxSearches` entries; if storage is full, drops more until it fits. */
  private write(entries: Record<string, CachedSearch>) {
    let keys = Object.keys(entries)
      .sort((a, b) => entries[b].lastUsed - entries[a].lastUsed)
      .slice(0, this.maxSearches());

    while (true) {
      try {
        if (keys.length === 0) {
          localStorage.removeItem(CACHE_KEY);
        } else {
          localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(keys.map(k => [k, entries[k]]))));
        }
        this.count.set(keys.length);
        return;
      } catch (e) {
        if (keys.length === 0) throw e;
        keys = keys.slice(0, -1);
      }
    }
  }
}

function clampSize(size: number): number {
  return Number.isFinite(size) ? Math.min(MAX_SEARCH_CACHE_SIZE, Math.max(0, Math.round(size))) : DEFAULT_SEARCH_CACHE_SIZE;
}

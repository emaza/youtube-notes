import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { BrowserUrlService } from './browser-url.service';
import { SearchCacheService } from './search-cache.service';
import { SearchFilters, normalizeFilters, serializeFilters, toApiParams } from '../utils/search';

export interface SearchResult {
  videoId: string;
  title: string;
  description: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  thumbnail: string;
  liveBroadcastContent: 'none' | 'live' | 'upcoming';
}

export interface SearchPage {
  results: SearchResult[];
  nextPageToken: string | null;
  prevPageToken: string | null;
  totalResults: number;
}

export interface SearchCategory {
  id: string;
  title: string;
}

/**
 * Video search through our own backend (`/api/search`), so the YouTube API key
 * never reaches the browser. The active search lives in the browser URL, and
 * its pages in the local search cache.
 */
@Injectable({
  providedIn: 'root'
})
export class YouTubeSearchService {
  private http = inject(HttpClient);
  private browserUrl = inject(BrowserUrlService);
  private cache = inject(SearchCacheService);

  filters = signal<SearchFilters | null>(null);
  page = signal<SearchPage | null>(null);
  pageNumber = signal(1);
  loading = signal(false);
  error = signal<string | null>(null);
  fromCache = signal(false);

  active = computed(() => this.filters() !== null);
  query = computed(() => this.filters()?.q ?? '');

  /** Category names already fetched, by id (for the filter chips). */
  categoryNames = signal<Record<string, string>>({});
  private categoriesByRegion = new Map<string, Promise<SearchCategory[]>>();

  // Ignores responses that arrive after a newer search or page was requested.
  private requestId = 0;

  constructor() {
    this.restoreFromUrl();
    // Back/forward: the URL has already changed, so restore the search it describes.
    this.browserUrl.onNavigate(() => this.restoreFromUrl());
  }

  search(filters: SearchFilters) {
    const normalized = normalizeFilters(filters);
    if (!normalized) return;
    this.filters.set(normalized);
    this.browserUrl.showSearch(normalized);
    this.loadPage(null, 1);
  }

  nextPage() {
    const token = this.page()?.nextPageToken;
    if (token) this.loadPage(token, this.pageNumber() + 1);
  }

  previousPage() {
    const token = this.page()?.prevPageToken;
    if (token) this.loadPage(token, this.pageNumber() - 1);
  }

  /** Closes the search; with `updateUrl` it is also removed from the browser URL. */
  clear(updateUrl = true) {
    this.requestId++;
    this.filters.set(null);
    this.page.set(null);
    this.error.set(null);
    this.loading.set(false);
    if (updateUrl) this.browserUrl.clear();
  }

  getCategories(regionCode: string): Promise<SearchCategory[]> {
    let request = this.categoriesByRegion.get(regionCode);
    if (!request) {
      request = firstValueFrom(this.http.get<{ categories: SearchCategory[] }>(
        '/api/search/categories', { params: { regionCode, hl: 'en' } }
      )).then(({ categories }) => {
        this.categoryNames.update(names => ({
          ...names, ...Object.fromEntries(categories.map(c => [c.id, c.title]))
        }));
        return categories;
      });
      // A failed request is not cached, so it can be retried.
      request.catch(() => this.categoriesByRegion.delete(regionCode));
      this.categoriesByRegion.set(regionCode, request);
    }
    return request;
  }

  private restoreFromUrl() {
    const fromUrl = this.browserUrl.readSearch();
    if (!fromUrl) {
      if (this.active()) this.clear(false);
      return;
    }
    const current = this.filters();
    if (current && serializeFilters(current) === serializeFilters(fromUrl) && this.page()) return;
    this.filters.set(fromUrl);
    this.loadPage(null, 1);
  }

  private async loadPage(pageToken: string | null, pageNumber: number) {
    const filters = this.filters();
    if (!filters) return;

    const id = ++this.requestId;
    const searchKey = serializeFilters(filters);
    this.error.set(null);
    this.pageNumber.set(pageNumber);

    const cached = this.cache.get(searchKey, pageNumber);
    if (cached) {
      this.page.set(cached);
      this.fromCache.set(true);
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.fromCache.set(false);
    try {
      const params = toApiParams(filters);
      if (pageToken) params['pageToken'] = pageToken;
      const page = await firstValueFrom(this.http.get<SearchPage>('/api/search', { params }));
      if (id !== this.requestId) return;
      this.cache.put(searchKey, pageNumber, page);
      this.page.set(page);
    } catch (e) {
      if (id !== this.requestId) return;
      const message = e instanceof HttpErrorResponse ? e.error?.error : null;
      this.error.set(message || 'The search failed. Please try again.');
      this.page.set(null);
    } finally {
      if (id === this.requestId) this.loading.set(false);
    }
  }
}

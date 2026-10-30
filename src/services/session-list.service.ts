import { Injectable, signal, computed, inject } from '@angular/core';
import { StorageService, SavedVideoSummary } from './storage.service';

export type SessionTypeFilter = 'all' | 'video' | 'short';

/** Saved sessions shown on the home page: search, type filter and pagination. */
@Injectable({
  providedIn: 'root'
})
export class SessionListService {
  private storageService = inject(StorageService);

  savedVideos = signal<SavedVideoSummary[]>([]);
  searchQuery = signal<string>('');
  typeFilter = signal<SessionTypeFilter>('all');
  currentPage = signal(1);
  readonly ITEMS_PER_PAGE = 12;

  filteredVideos = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const type = this.typeFilter();
    let items = this.savedVideos();

    if (type !== 'all') {
      items = items.filter(v => v.type === type);
    }

    if (!query) return items;

    return items.filter(v =>
      v.title.toLowerCase().includes(query) ||
      (v.channelTitle && v.channelTitle.toLowerCase().includes(query))
    );
  });

  totalPages = computed(() => Math.ceil(this.filteredVideos().length / this.ITEMS_PER_PAGE));

  paginatedVideos = computed(() => {
    const videos = this.filteredVideos();
    const total = this.totalPages();
    let page = this.currentPage();

    // Defensive check: If current page is beyond total pages (e.g. after filtering), use page 1 for slicing
    if (page > total && total > 0) {
      page = 1;
    }

    const startIndex = (page - 1) * this.ITEMS_PER_PAGE;

    // Safety check
    if (videos.length === 0) return [];

    return videos.slice(startIndex, startIndex + this.ITEMS_PER_PAGE);
  });

  constructor() {
    this.refresh();
  }

  /** Reloads the list from storage (after saving, deleting or importing). */
  refresh() {
    this.savedVideos.set(this.storageService.getAllSavedVideos());
  }

  setSearchQuery(query: string) {
    this.searchQuery.set(query);
    this.currentPage.set(1);
  }

  setTypeFilter(type: SessionTypeFilter) {
    this.typeFilter.set(type);
    this.currentPage.set(1);
  }
}

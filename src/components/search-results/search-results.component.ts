import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SearchPage, SearchResult } from '../../services/youtube-search.service';
import { SearchFilters, buildQuery, describeFilters } from '../../utils/search';

@Component({
  selector: 'app-search-results',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './search-results.component.html'
})
export class SearchResultsComponent {
  filters = input.required<SearchFilters>();
  page = input<SearchPage | null>(null);
  pageNumber = input(1);
  loading = input(false);
  error = input<string | null>(null);
  fromCache = input(false);
  savedIds = input<Set<string>>(new Set());
  categoryNames = input<Record<string, string>>({});

  openVideo = output<SearchResult>();
  saveVideo = output<SearchResult>();
  clearSearch = output<void>();
  nextPage = output<void>();
  previousPage = output<void>();

  /** Words as sent to YouTube (main words, exact phrase, any/none). */
  query = computed(() => buildQuery(this.filters()));
  filterChips = computed(() => describeFilters(this.filters(), this.categoryNames()));
}

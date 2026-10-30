import { Component, ChangeDetectionStrategy, input, output, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { YouTubeSearchService, SearchCategory } from '../../services/youtube-search.service';
import {
  SearchFilters, SearchFilterKey, SelectOption, SEARCH_FILTER_KEYS, normalizeFilters, serializeFilters, ORDER_OPTIONS, VIDEO_FILTER_OPTIONS, MAX_RESULTS_OPTIONS,
  RADIUS_UNITS, REGION_OPTIONS, LANGUAGE_OPTIONS, TOPIC_GROUPS
} from '../../utils/search';
import { extractVideoId } from '../../utils/youtube';

const DEFAULT_CATEGORY_REGION = 'US';

/** Gmail-style advanced search panel with every `search.list` option usable with an API key. */
@Component({
  selector: 'app-advanced-search',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './advanced-search.component.html',
  host: { '(document:keydown.escape)': 'close.emit()' }
})
export class AdvancedSearchComponent implements OnInit {
  private searchService = inject(YouTubeSearchService);

  /** The active search, to prefill the form. */
  filters = input<SearchFilters | null>(null);
  /** What is typed in the main input (wins over the active search's words, unless it's a video link). */
  text = input('');

  search = output<SearchFilters>();
  close = output<void>();

  form: SearchFilters = {};
  radiusAmount = '';
  radiusUnit = 'km';
  validationError = signal<string | null>(null);

  categories = signal<SearchCategory[]>([]);
  categoriesError = signal(false);

  readonly orderOptions = ORDER_OPTIONS;
  readonly regionOptions = REGION_OPTIONS;
  readonly languageOptions = LANGUAGE_OPTIONS;
  readonly topicGroups = TOPIC_GROUPS;
  readonly maxResultsOptions = MAX_RESULTS_OPTIONS;
  readonly radiusUnits = RADIUS_UNITS;

  /** Simple "Any / option…" selects, in display order. */
  readonly videoSelects: { key: SearchFilterKey; label: string; anyLabel: string; options: SelectOption[] }[] = [
    this.select('videoDuration', 'Duration'),
    this.select('eventType', 'Live broadcasts', 'Any'),
    this.select('videoDefinition', 'Quality'),
    this.select('videoDimension', 'Dimension'),
    this.select('videoCaption', 'Captions'),
    this.select('videoLicense', 'License'),
    this.select('videoType', 'Video type'),
    this.select('videoEmbeddable', 'Embeddable'),
    this.select('videoSyndicated', 'Syndicated'),
    this.select('safeSearch', 'SafeSearch', 'Moderate (default)')
  ];

  ngOnInit() {
    this.form = emptyForm(this.filters());
    const typed = this.text().trim();
    if (typed && !extractVideoId(typed) && typed !== (this.filters()?.q ?? '')) this.form.q = typed;

    const radius = this.form.locationRadius?.match(/^([\d.]+)(\w+)$/);
    if (radius) {
      this.radiusAmount = radius[1];
      this.radiusUnit = radius[2];
    }

    this.loadCategories();
  }

  loadCategories() {
    const region = this.form.regionCode || DEFAULT_CATEGORY_REGION;
    this.categoriesError.set(false);
    this.searchService.getCategories(region)
      .then(categories => {
        this.categories.set(categories);
        // Category ids differ between regions.
        if (this.form.videoCategoryId && !categories.some(c => c.id === this.form.videoCategoryId)) {
          this.form.videoCategoryId = '';
        }
      })
      .catch(() => this.categoriesError.set(true));
  }

  reset() {
    this.form = emptyForm();
    this.radiusAmount = '';
    this.radiusUnit = 'km';
    this.validationError.set(null);
    this.loadCategories();
  }

  /** Only when the form has some filter and differs from the search already shown. */
  canSubmit(): boolean {
    const filters = normalizeFilters(this.formFilters());
    const active = this.filters();
    return !!filters && (!active || serializeFilters(filters) !== serializeFilters(active));
  }

  submit() {
    if (!this.canSubmit()) return;
    const filters = this.formFilters();

    if (!!filters.location !== !!filters.locationRadius) {
      this.validationError.set('Location and radius must be set together.');
      return;
    }
    if (filters.location && !/^-?\d{1,2}(\.\d+)?,-?\d{1,3}(\.\d+)?$/.test(filters.location)) {
      this.validationError.set('Location must be "latitude,longitude", e.g. 40.4168,-3.7038.');
      return;
    }
    if (filters.publishedAfter && filters.publishedBefore && filters.publishedAfter > filters.publishedBefore) {
      this.validationError.set('The "from" date is after the "to" date.');
      return;
    }

    this.validationError.set(null);
    this.search.emit(filters);
  }

  private formFilters(): SearchFilters {
    return {
      ...this.form,
      location: this.form.location?.replace(/\s+/g, ''),
      locationRadius: this.radiusAmount ? `${this.radiusAmount}${this.radiusUnit}` : ''
    };
  }

  private select(key: SearchFilterKey, label: string, anyLabel = 'Any') {
    return { key, label, anyLabel, options: VIDEO_FILTER_OPTIONS[key] ?? [] };
  }
}

/** Every field as a string ('' when unset), so selects show their "Any" option. */
function emptyForm(filters: SearchFilters | null = null): SearchFilters {
  return Object.fromEntries(SEARCH_FILTER_KEYS.map(key => [key, filters?.[key] ?? '']));
}

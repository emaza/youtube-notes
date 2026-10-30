import { Component, ChangeDetectionStrategy, input, output, signal, linkedSignal, viewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdvancedSearchComponent } from '../advanced-search/advanced-search.component';
import { SearchFilters } from '../../utils/search';
import { extractVideoId } from '../../utils/youtube';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, FormsModule, AdvancedSearchComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './header.component.html',
  host: { '(document:click)': 'onDocumentClick($event)' }
})
export class HeaderComponent {
  /** Text shown in the input: the open video's link or the active search's words. */
  value = input.required<string>();
  /** The active search, if any (prefills the advanced panel). */
  searchFilters = input<SearchFilters | null>(null);

  urlChange = output<string>();
  search = output<SearchFilters>();
  openSettings = output<void>();
  clearUrl = output<void>();

  text = linkedSignal(() => this.value());
  isAdvancedOpen = signal(false);

  private searchBox = viewChild.required<ElementRef<HTMLElement>>('searchBox');

  onInput(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.text.set(value);
    // A pasted link opens right away; anything else waits for a search.
    if (extractVideoId(value)) this.urlChange.emit(value);
  }

  submitSimpleSearch() {
    const text = this.text().trim();
    if (!text) return;
    this.isAdvancedOpen.set(false);
    if (extractVideoId(text)) {
      this.urlChange.emit(text);
    } else {
      this.search.emit({ q: text });
    }
  }

  submitAdvancedSearch(filters: SearchFilters) {
    this.isAdvancedOpen.set(false);
    this.search.emit(filters);
  }

  clear() {
    this.text.set('');
    this.isAdvancedOpen.set(false);
    this.clearUrl.emit();
  }

  onDocumentClick(event: MouseEvent) {
    if (this.isAdvancedOpen() && !this.searchBox().nativeElement.contains(event.target as Node)) {
      this.isAdvancedOpen.set(false);
    }
  }
}


import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SavedVideoSummary } from '../../services/storage.service';

@Component({
  selector: 'app-session-list',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './session-list.component.html'
})
export class SessionListComponent {
  videos = input.required<SavedVideoSummary[]>();
  currentPage = input.required<number>();
  totalPages = input.required<number>();
  searchQuery = input.required<string>();
  typeFilter = input.required<'all' | 'video' | 'short'>();

  searchQueryChange = output<string>();
  filterTypeChange = output<'all' | 'video' | 'short'>();
  selectVideo = output<SavedVideoSummary>();
  deleteVideo = output<string>();
  pageChange = output<number>();

  onSearchInput(event: Event) {
    const input = event.target as HTMLInputElement;
    this.searchQueryChange.emit(input.value);
  }
}


import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SavedVideoSummary } from '../services/storage.service';

@Component({
  selector: 'app-session-list',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-10 animate-fade-in">
        
      <!-- Controls Header -->
      <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div class="flex items-center gap-4">
          <h2 class="text-xl font-bold text-gray-300 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            Saved Sessions
          </h2>

          <!-- Active Filter Badge -->
          @if (typeFilter() !== 'all') {
            <button 
              (click)="filterTypeChange.emit('all')"
              class="bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs px-3 py-1 rounded-full flex items-center gap-1 transition-colors animate-fade-in"
            >
              <span>Filter: {{ typeFilter() === 'short' ? 'Shorts' : 'Videos' }}</span>
              <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
              </svg>
            </button>
          }
        </div>

        <!-- Search Input -->
        <div class="relative w-full sm:w-64">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input 
            type="text"
            [value]="searchQuery()"
            (input)="onSearchInput($event)"
            placeholder="Search title or channel..."
            class="w-full bg-gray-800 border border-gray-700 rounded-lg py-1.5 pl-9 pr-10 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors"
            >
            @if (searchQuery()) {
              <button 
                (click)="searchQueryChange.emit('')"
                class="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-white cursor-pointer focus:outline-none"
                title="Clear search"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                </svg>
              </button>
            }
        </div>
      </div>
      
      @if (videos().length === 0) {
          <div class="text-center py-12 bg-gray-800/50 rounded-lg border border-gray-700/50">
            <p class="text-gray-400">No sessions found matching your criteria.</p>
          </div>
      }

      <!-- Unified Grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        @for (video of videos(); track video.videoId) {
          <div 
            (click)="selectVideo.emit(video)"
            class="bg-gray-800 rounded-lg overflow-hidden shadow-lg border border-gray-700 cursor-pointer hover:border-purple-500 hover:shadow-purple-500/20 transition-all duration-200 group relative flex flex-col h-full"
          >
            <!-- Thumbnail -->
            <div class="relative h-36 w-full bg-black overflow-hidden shrink-0">
              <img 
                [src]="'https://i.ytimg.com/vi/' + video.videoId + '/mqdefault.jpg'" 
                alt="Video Thumbnail"
                class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
              >
              <div class="absolute inset-0 bg-gradient-to-t from-gray-900 via-transparent to-transparent opacity-60"></div>
              
              <!-- Short Tag Filter (Only for shorts) -->
              @if (video.type === 'short') {
                <div class="absolute top-2 left-2 z-20">
                  <button
                    type="button"
                    (click)="filterTypeChange.emit('short'); $event.stopPropagation()"
                    class="bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 shadow-md transition-colors"
                    title="Filter by Shorts"
                  >
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd" />
                      </svg>
                      Shorts
                  </button>
                </div>
              }

              <!-- Channel Tag Over Image -->
              @if (video.channelTitle) {
                <div class="absolute bottom-2 left-2 right-2">
                  <button
                    type="button"
                    (click)="searchQueryChange.emit(video.channelTitle); $event.stopPropagation()"
                    class="inline-flex items-center gap-1 bg-black/70 backdrop-blur-sm text-white text-[10px] px-2 py-0.5 rounded-full border border-gray-600/50 truncate max-w-full hover:bg-purple-900/80 hover:border-purple-500 transition-colors cursor-pointer text-left"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 text-purple-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd" />
                    </svg>
                    <span class="truncate">{{ video.channelTitle }}</span>
                  </button>
                </div>
              }
            </div>
            
            <!-- Content -->
            <div class="p-3 flex flex-col flex-grow">
              <h3 class="font-bold text-sm text-gray-100 line-clamp-2 min-h-[2.5em] mb-2" [title]="video.title">
                {{ video.title }}
              </h3>
              <div class="mt-auto pt-2 border-t border-gray-700/50">
                <p class="text-[10px] text-gray-500">
                  Updated: {{ video.lastUpdated | date:'mediumDate' }}
                </p>
              </div>
            </div>

            <!-- Delete Button -->
            <button 
              (click)="deleteVideo.emit(video.videoId); $event.stopPropagation()"
              class="absolute top-2 right-2 bg-red-600 hover:bg-red-500 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10"
              title="Delete Session"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        }
      </div>

      <!-- Pagination Controls -->
      @if (totalPages() > 1) {
        <div class="flex justify-center items-center gap-4 mt-6">
          <button 
            (click)="pageChange.emit(currentPage() - 1)" 
            [disabled]="currentPage() === 1"
            class="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          
          <span class="text-gray-400 text-sm">
            Page <span class="text-white font-bold">{{ currentPage() }}</span> of {{ totalPages() }}
          </span>
          
          <button 
            (click)="pageChange.emit(currentPage() + 1)" 
            [disabled]="currentPage() === totalPages()"
            class="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      }
    </div>
  `
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

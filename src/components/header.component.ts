
import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="relative flex flex-col md:flex-row items-center justify-center gap-6 mb-10 flex-shrink-0 w-full max-w-5xl mx-auto">
      
      <!-- Logo Section -->
      <div class="relative group shrink-0">
        <div class="absolute -inset-1 bg-gradient-to-r from-red-600 to-purple-600 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
        <!-- Replace the src below with your uploaded image URL -->
        <img 
          src="https://cdn-icons-png.flaticon.com/512/3670/3670147.png" 
          alt="YouTube Notetaker Logo" 
          class="relative w-20 h-20 sm:w-24 sm:h-24 object-contain filter drop-shadow-2xl transform group-hover:scale-105 transition-transform duration-300 bg-gray-900 rounded-xl p-2 border border-gray-800"
        >
      </div>

      <!-- Text Section -->
      <div class="text-center md:text-left z-10">
        <h1 class="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-gray-200 tracking-tight drop-shadow-sm">
          YouTube AI Notes
        </h1>
        <p class="mt-2 text-lg text-gray-400 font-medium tracking-wide">Watch, summarize, and chat with AI. All in one place.</p>
      </div>

      <!-- Settings Icon Button (Absolute positioning relative to header container) -->
      <div class="absolute top-0 right-0 md:top-1/2 md:-translate-y-1/2 md:-right-16">
        <button 
          (click)="openSettings.emit()"
          class="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-sm"
          title="Settings"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>
    </header>

    <!-- URL Input -->
    <div class="relative mb-8 flex-shrink-0 w-full max-w-4xl mx-auto">
      <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
         <svg class="h-5 w-5 text-gray-500" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/>
         </svg>
      </div>
      <input 
        type="text" 
        [value]="url()"
        (input)="onUrlInput($event)"
        placeholder="Paste a YouTube video link here..." 
        class="w-full bg-gray-800/80 backdrop-blur-sm border-2 border-gray-700 focus:ring-2 focus:ring-red-500 focus:border-red-500 rounded-xl py-4 pl-12 pr-12 text-white placeholder-gray-500 transition-all duration-200 shadow-lg text-lg"
      >
      @if (url()) {
        <button 
          (click)="clearUrl.emit()"
          class="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-500 hover:text-white cursor-pointer focus:outline-none transition-colors"
          title="Clear link"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
          </svg>
        </button>
      }
    </div>
  `
})
export class HeaderComponent {
  url = input.required<string>();
  
  urlChange = output<string>();
  openSettings = output<void>();
  clearUrl = output<void>();

  onUrlInput(event: Event) {
    const input = event.target as HTMLInputElement;
    this.urlChange.emit(input.value);
  }
}

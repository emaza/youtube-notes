
import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-video-player',
  standalone: true,
  imports: [CommonModule, DragDropModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div 
      cdkDrag
      cdkDragBoundary="body"
      class="bg-gray-800/80 backdrop-blur-md rounded-xl shadow-2xl ring-1 ring-white/10 overflow-hidden group hover:shadow-purple-500/20 resize flex flex-col min-w-[320px] min-h-[240px] w-[560px] h-[400px]"
    >
      <!-- Header (Drag Handle) -->
      <div cdkDragHandle class="p-4 bg-gray-900/90 cursor-move flex items-center justify-between shrink-0 border-b border-gray-700 select-none">
        <h2 class="font-bold text-lg text-white flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
            <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
          </svg>
          {{ title() || 'Video Player' }}
        </h2>
        <div class="flex items-center gap-2">
            <!-- Move Icon -->
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-gray-500 hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
        </div>
      </div>
      
      <!-- Video Container -->
      <div class="flex-grow w-full relative bg-black">
        @if(sanitizedUrl(); as url) {
          <iframe 
            class="absolute top-0 left-0 w-full h-full pointer-events-auto" 
            [src]="url" 
            title="YouTube video player"
            frameborder="0" 
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
            referrerpolicy="strict-origin-when-cross-origin"
            allowfullscreen>
          </iframe>
        }
      </div>
      
      <!-- Resize Handle Footer -->
      <div class="h-8 bg-gray-900/90 border-t border-gray-700 shrink-0 flex justify-end items-center px-2 cursor-nwse-resize select-none">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-500 opacity-80" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd" opacity="0"/>
          <path d="M16 16L10 10M16 12V16H12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
    </div>
  `
})
export class VideoPlayerComponent {
  videoId = input.required<string | null>();
  title = input<string>('');

  sanitizedUrl = computed(() => {
    const id = this.videoId();
    if (!id) return null;
    const embedUrl = new URL(`https://www.youtube.com/embed/${id}`);
    embedUrl.searchParams.set('enablejsapi', '1');
    if (typeof window !== 'undefined' && window.location.origin && window.location.origin !== 'null') {
      embedUrl.searchParams.set('origin', window.location.origin);
    }
    return this.sanitizer.bypassSecurityTrustResourceUrl(embedUrl.toString());
  });

  constructor(private sanitizer: DomSanitizer) {}
}

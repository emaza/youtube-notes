
import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { PersistPanelDirective } from '../../directives/persist-panel.directive';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-video-player',
  standalone: true,
  imports: [CommonModule, DragDropModule, PersistPanelDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './video-player.component.html'
})
export class VideoPlayerComponent {
  videoId = input.required<string | null>();
  title = input<string>('');
  isShort = input(false);

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

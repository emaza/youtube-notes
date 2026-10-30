
import { Component, ChangeDetectionStrategy, input, output, signal, inject, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { PersistPanelDirective } from '../../directives/persist-panel.directive';
import { FormsModule } from '@angular/forms';
import { markdownToHtml } from '../../utils/markdown';
import { SpeechService } from '../../services/speech.service';
import { SpeechControlsComponent } from '../speech-controls/speech-controls.component';

@Component({
  selector: 'app-notes',
  standalone: true,
  imports: [CommonModule, DragDropModule, FormsModule, PersistPanelDirective, SpeechControlsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './notes.component.html'
})
export class NotesComponent {
  notes = input.required<string>();
  /** Layout the panel lives in ('video' | 'short'); positions are remembered per layout. */
  layout = input('video');
  /** Settings language, used for the reading voice. */
  language = input('es');
  notesChange = output<string>();
  formatted = signal(false);
  toHtml = markdownToHtml;

  private speech = inject(SpeechService);

  constructor() {
    // Stop reading the notes (this panel is the speech owner) when the video is closed.
    inject(DestroyRef).onDestroy(() => {
      if (this.speech.speaking() === this) this.speech.stop();
    });
  }

  onNotesInput(event: Event) {
    const input = event.target as HTMLTextAreaElement;
    this.notesChange.emit(input.value);
  }
}


import { Component, ChangeDetectionStrategy, input, output, signal, computed, inject, DestroyRef, viewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { PersistPanelDirective } from '../../directives/persist-panel.directive';
import { FormsModule } from '@angular/forms';
import { markdownToHtml } from '../../utils/markdown';
import { SpeechService } from '../../services/speech.service';
import { markdownSlice, rangeText } from '../../utils/speech-text';
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
  private editor = viewChild<ElementRef<HTMLTextAreaElement>>('editor');
  private rendered = viewChild<ElementRef<HTMLElement>>('rendered');

  /** The editor's cursor or selection (the textarea keeps it while it isn't focused). */
  private editorSelection = signal<[number, number]>([0, 0]);

  /** Notes from the cursor or selection: the editor's, or the one marked in the formatted view. */
  passage = computed(() => {
    if (!this.formatted()) {
      const [start, end] = this.editorSelection();
      return markdownSlice(this.notes(), start, end > start ? end : undefined);
    }
    const rendered = this.rendered()?.nativeElement;
    const point = this.speech.startPoint();
    return rendered && point?.el === rendered ? rangeText(rendered, point.range) : null;
  });

  toggleFormatted() {
    this.formatted.set(!this.formatted());
    // The new editor or rendered view has no cursor of its own yet.
    this.editorSelection.set([0, 0]);
  }

  onEditorSelection(event: Event) {
    const editor = event.target as HTMLTextAreaElement;
    this.editorSelection.set([editor.selectionStart, editor.selectionEnd]);
  }

  clearStart() {
    if (this.formatted()) {
      this.speech.clearStartPoint();
    } else {
      this.editor()?.nativeElement.setSelectionRange(0, 0);
      this.editorSelection.set([0, 0]);
    }
  }

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

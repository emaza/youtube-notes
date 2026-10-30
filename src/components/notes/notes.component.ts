
import { Component, ChangeDetectionStrategy, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { PersistPanelDirective } from '../../directives/persist-panel.directive';
import { FormsModule } from '@angular/forms';
import { markdownToHtml } from '../../utils/markdown';

@Component({
  selector: 'app-notes',
  standalone: true,
  imports: [CommonModule, DragDropModule, FormsModule, PersistPanelDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './notes.component.html'
})
export class NotesComponent {
  notes = input.required<string>();
  /** Layout the panel lives in ('video' | 'short'); positions are remembered per layout. */
  layout = input('video');
  notesChange = output<string>();
  formatted = signal(false);
  toHtml = markdownToHtml;

  onNotesInput(event: Event) {
    const input = event.target as HTMLTextAreaElement;
    this.notesChange.emit(input.value);
  }
}

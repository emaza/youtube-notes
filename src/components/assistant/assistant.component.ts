
import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { PersistPanelDirective } from '../../directives/persist-panel.directive';
import { FormsModule } from '@angular/forms';
import { ChatMessage } from '../../services/gemini.service';
import { ChatListComponent } from '../chat-list/chat-list.component';

@Component({
  selector: 'app-assistant',
  standalone: true,
  imports: [CommonModule, DragDropModule, FormsModule, ChatListComponent, PersistPanelDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './assistant.component.html'
})
export class AssistantComponent {
  messages = input.required<ChatMessage[]>();
  /** Layout the panel lives in ('video' | 'short'); positions are remembered per layout. */
  layout = input('video');
  isThinking = input.required<boolean>();
  isStreaming = input.required<boolean>();
  error = input.required<string | null>();
  showSummaryButton = input.required<boolean>();
  currentLanguage = input.required<string>();

  sendMessage = output<string>();
  generateSummary = output<void>();
  openSettings = output<void>();

  currentInput = '';

  onEnter(event: Event) {
    event.preventDefault();
    this.onSend();
  }

  onSend() {
    if (this.currentInput.trim() && !this.isThinking()) {
        this.sendMessage.emit(this.currentInput);
        this.currentInput = '';
    }
  }
}

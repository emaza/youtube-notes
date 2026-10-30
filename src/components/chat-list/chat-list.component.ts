
import { Component, ChangeDetectionStrategy, input, ViewChild, ElementRef, effect, signal, inject, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatMessage } from '../../services/gemini.service';
import { markdownToHtml } from '../../utils/markdown';
import { SpeechService } from '../../services/speech.service';
import { SpeechControlsComponent } from '../speech-controls/speech-controls.component';

@Component({
  selector: 'app-chat-list',
  standalone: true,
  imports: [CommonModule, SpeechControlsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      overflow: hidden;
      min-height: 0;
    }
  `],
  templateUrl: './chat-list.component.html'
})
export class ChatListComponent {
  messages = input.required<ChatMessage[]>();
  isThinking = input.required<boolean>();
  isStreaming = input.required<boolean>();
  error = input.required<string | null>();
  /** Settings language, used for the reading voice. */
  language = input('es');

  speech = inject(SpeechService);

  // State to track which message was just copied
  copiedIndex = signal<number | null>(null);

  @ViewChild('chatContainer') chatContainer!: ElementRef;

  constructor() {
    // Stop reading when the chat goes away (e.g. the video is closed).
    inject(DestroyRef).onDestroy(() => this.speech.stop());

    // Auto-scroll: after a question, go to the bottom (question + "thinking");
    // when a new AI answer appears, show its start at the top and stop following
    // the stream, so the beginning and the audio buttons stay in view.
    let previousCount = 0;
    effect(() => {
      const msgs = this.messages();
      const thinking = this.isThinking();
      const isNewMessage = msgs.length !== previousCount;
      previousCount = msgs.length;
      if (!this.chatContainer) return;

      setTimeout(() => {
        const container: HTMLElement = this.chatContainer.nativeElement;
        if (thinking || msgs.at(-1)?.role === 'user') {
          container.scrollTop = container.scrollHeight;
        } else if (isNewMessage) {
          const last = Array.from(container.querySelectorAll<HTMLElement>('[data-message]')).at(-1);
          if (last) {
            container.scrollTop += last.getBoundingClientRect().top - container.getBoundingClientRect().top - 16;
          }
        }
      }, 50);
    });
  }

  // Kept per message object: the final message object is stable once streaming ends.
  showRaw = signal(new Set<ChatMessage>());

  toggleRaw(msg: ChatMessage) {
    this.showRaw.update(set => {
      const next = new Set(set);
      if (!next.delete(msg)) next.add(msg);
      return next;
    });
  }

  toHtml = markdownToHtml;

  async copyToClipboard(text: string, index: number) {
    try {
      await navigator.clipboard.writeText(text);
      this.copiedIndex.set(index);
      
      // Reset the copied state after 2 seconds
      setTimeout(() => {
        if (this.copiedIndex() === index) {
          this.copiedIndex.set(null);
        }
      }, 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  }
}

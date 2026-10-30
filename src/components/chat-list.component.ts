
import { Component, ChangeDetectionStrategy, input, ViewChild, ElementRef, effect, signal, inject, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatMessage } from '../services/gemini.service';
import { markdownToHtml } from '../utils/markdown';
import { SpeechService } from '../services/speech.service';

@Component({
  selector: 'app-chat-list',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      overflow: hidden;
      min-height: 0;
    }
  `],
  template: `
    <div class="flex-grow overflow-y-auto p-4 space-y-4" #chatContainer>
      @if (messages().length === 0) {
        <div class="flex flex-col items-center justify-center h-full text-gray-500 text-sm text-center opacity-60">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          <p>Ask me about the video...</p>
        </div>
      }

      @for (msg of messages(); track $index) {
        <div class="flex flex-col gap-1" [class.items-end]="msg.role === 'user'" [class.items-start]="msg.role === 'model'">
          <div 
            class="max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-md group relative"
            [class.bg-purple-600]="msg.role === 'user'"
            [class.text-white]="msg.role === 'user'"
            [class.bg-gray-700]="msg.role === 'model'"
            [class.text-gray-100]="msg.role === 'model'"
            [class.rounded-br-none]="msg.role === 'user'"
            [class.rounded-bl-none]="msg.role === 'model'"
          >
            @if (msg.role === 'model' && !(isStreaming() && $last) && speech.supported) {
              <div class="-mt-1 -ml-1.5 mb-2 pb-1 border-b border-gray-600/50 flex items-center gap-1">
                @if (speech.speaking() === msg) {
                  @if (speech.paused()) {
                    <button
                      (click)="speech.resume()"
                      class="p-1.5 rounded-full text-white bg-gray-600/50 hover:bg-gray-600 transition-colors"
                      title="Continuar lectura"
                      aria-label="Continuar lectura"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </button>
                  } @else {
                    <button
                      (click)="speech.pause()"
                      class="p-1.5 rounded-full text-white bg-gray-600/50 hover:bg-gray-600 transition-colors"
                      title="Pausar lectura"
                      aria-label="Pausar lectura"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </button>
                  }
                  <button
                    (click)="speech.stop()"
                    class="p-1.5 rounded-full text-gray-400 hover:text-white hover:bg-gray-600/50 transition-colors"
                    title="Detener lectura"
                    aria-label="Detener lectura"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" /></svg>
                  </button>
                } @else {
                  <button
                    (click)="speech.speak(msg, msg.text, language())"
                    class="p-1.5 rounded-full text-gray-400 hover:text-white hover:bg-gray-600/50 transition-colors"
                    title="Escuchar respuesta"
                    aria-label="Escuchar respuesta"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                  </button>
                }
              </div>
            }

            @if (msg.role === 'model' && !(isStreaming() && $last) && !showRaw().has(msg)) {
              <div [innerHTML]="toHtml(msg.text)" class="markdown-body select-text cursor-text"></div>
            } @else {
              <div class="whitespace-pre-wrap break-words select-text cursor-text leading-relaxed">{{ msg.text }}</div>
            }

            @if (msg.role === 'model' && !(isStreaming() && $last)) {
              <div class="mt-2 pt-2 border-t border-gray-600/50 flex justify-end gap-1">
                <button
                  (click)="toggleRaw(msg)"
                  class="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-gray-600/50"
                >
                  {{ showRaw().has(msg) ? 'Formatear respuesta' : 'Ver Markdown' }}
                </button>
                <button 
                  (click)="copyToClipboard(msg.text, $index)" 
                  class="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-gray-600/50"
                  [title]="copiedIndex() === $index ? 'Copied!' : 'Copy response'"
                >
                  @if (copiedIndex() === $index) {
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                    </svg>
                    <span class="text-green-400 font-medium">Copied</span>
                  } @else {
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                    <span>Copy</span>
                  }
                </button>
              </div>
            }
          </div>
          
          <!-- Sources for AI responses -->
          @if (msg.role === 'model' && msg.sources && msg.sources.length > 0) {
            <div class="ml-2 max-w-[85%] text-xs">
                <p class="text-gray-500 mb-1">Fuentes:</p>
                <div class="flex flex-wrap gap-2">
                  @for (source of msg.sources; track source.uri) {
                    <a [href]="source.uri" target="_blank" class="bg-gray-800 hover:bg-gray-700 border border-gray-600 text-blue-300 px-2 py-0.5 rounded truncate max-w-[150px]" [title]="source.title">
                      {{ source.title }}
                    </a>
                  }
                </div>
            </div>
          }
        </div>
      }

      @if (isThinking()) {
        <div class="flex items-start">
          <div class="bg-gray-700 rounded-2xl rounded-bl-none px-4 py-3 shadow-md flex items-center space-x-1">
            <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
            <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-75"></div>
            <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-150"></div>
          </div>
        </div>
      }

      @if (error()) {
        <div class="text-red-400 text-xs text-center p-2 bg-red-900/20 rounded border border-red-900/50">
          {{ error() }}
        </div>
      }
    </div>
  `
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

    // Auto-scroll effect
    effect(() => {
        const msgs = this.messages();
        const thinking = this.isThinking(); // Track thinking to scroll when it starts
        if (this.chatContainer) {
            setTimeout(() => {
                this.chatContainer.nativeElement.scrollTop = this.chatContainer.nativeElement.scrollHeight;
            }, 50);
        }
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

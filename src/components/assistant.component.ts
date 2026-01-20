
import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { FormsModule } from '@angular/forms';
import { ChatMessage } from '../services/gemini.service';
import { ChatListComponent } from './chat-list.component';

@Component({
  selector: 'app-assistant',
  standalone: true,
  imports: [CommonModule, DragDropModule, FormsModule, ChatListComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div 
      cdkDrag
      cdkDragBoundary="body"
      class="bg-gray-800/80 backdrop-blur-md rounded-xl shadow-2xl ring-1 ring-white/10 flex flex-col group hover:shadow-pink-500/20 resize overflow-hidden min-w-[320px] min-h-[500px] w-[450px] h-[700px]"
    >
      <!-- Header (Drag Handle) -->
      <div cdkDragHandle class="p-4 bg-gray-900/90 cursor-move flex items-center justify-between shrink-0 border-b border-gray-700 select-none">
        <h2 class="font-bold text-lg text-white flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-yellow-500" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clip-rule="evenodd" />
          </svg>
          Notes & AI Assistant
        </h2>
        <div class="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-gray-500 hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
        </div>
      </div>
      
      <div class="flex-grow flex flex-col overflow-hidden bg-gray-900/40">
        <!-- Notes Section -->
        <div class="p-4 flex flex-col flex-none border-b border-gray-700">
          <label for="notes" class="block text-sm font-medium text-gray-300 mb-2">My Notes</label>
          <textarea 
            id="notes"
            [value]="notes()"
            (input)="onNotesInput($event)"
            placeholder="Take your personal notes here..."
            class="w-full h-40 bg-gray-900/60 border border-gray-700 focus:ring-2 focus:ring-pink-500 focus:border-pink-500 rounded-lg p-3 text-gray-200 placeholder-gray-500 transition-colors resize-y text-sm select-text"
          ></textarea>
        </div>
        
        <!-- Chat Section -->
        <div class="flex flex-col flex-grow overflow-hidden">
          <div class="px-4 py-2 border-b border-gray-700/50 bg-gray-900/20 flex justify-between items-center shrink-0">
            <div class="flex items-center gap-2">
              <span class="text-xs font-semibold text-gray-400 uppercase tracking-wider">AI Chat</span>
              <button 
                (click)="openSettings.emit()" 
                class="flex items-center gap-1 text-[10px] font-bold uppercase bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 px-1.5 py-0.5 rounded border border-gray-700 hover:border-gray-500 transition-colors"
                title="Change Language"
              >
                <span>{{ currentLanguage() }}</span>
                <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd" />
                </svg>
              </button>
            </div>
            @if (showSummaryButton()) {
              <button 
                (click)="generateSummary.emit()" 
                class="text-xs bg-purple-600 hover:bg-purple-500 text-white px-2 py-1 rounded transition-colors"
              >
                ✨ Generate Summary
              </button>
            }
          </div>

          <app-chat-list
            class="flex-grow min-h-0 basis-0"
            [messages]="messages()"
            [isThinking]="isThinking()"
            [error]="error()"
          ></app-chat-list>

          <!-- Input Area -->
          <div class="p-3 bg-gray-900/80 border-t border-gray-700 shrink-0">
            <div class="flex gap-2">
              <input 
                type="text" 
                [(ngModel)]="currentInput"
                (keydown.enter)="onEnter($event)"
                [disabled]="isThinking()"
                placeholder="Type your question..." 
                class="flex-grow bg-gray-800 border border-gray-600 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 transition-colors disabled:opacity-50"
              >
              <button 
                (click)="onSend()"
                [disabled]="!currentInput.trim() || isThinking()"
                class="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white p-2 rounded-lg transition-colors flex items-center justify-center w-10"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 transform rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </div>

        </div>
      </div>
      
      <!-- Footer Resize Handle -->
      <div class="h-8 bg-gray-900/90 border-t border-gray-700 shrink-0 flex justify-end items-center px-2 cursor-nwse-resize select-none">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-500 opacity-80" viewBox="0 0 20 20" fill="currentColor">
            <path d="M16 16L10 10M16 12V16H12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
      </div>
    </div>
  `
})
export class AssistantComponent {
  notes = input.required<string>();
  messages = input.required<ChatMessage[]>();
  isThinking = input.required<boolean>();
  error = input.required<string | null>();
  showSummaryButton = input.required<boolean>();
  currentLanguage = input.required<string>();

  notesChange = output<string>();
  sendMessage = output<string>();
  generateSummary = output<void>();
  openSettings = output<void>();

  currentInput = '';

  onNotesInput(event: Event) {
    const input = event.target as HTMLTextAreaElement;
    this.notesChange.emit(input.value);
  }

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

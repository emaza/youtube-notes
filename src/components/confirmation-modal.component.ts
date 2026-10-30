
import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-confirmation-modal',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isOpen()) {
      <div class="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-0">
        <!-- Backdrop -->
        <div 
          class="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
          (click)="cancel.emit()"
        ></div>

        <!-- Modal Panel -->
        <div class="relative bg-gray-800 border border-gray-700 rounded-xl shadow-2xl transform transition-all w-full max-w-lg overflow-hidden animate-scale-in">
          
          <!-- Header -->
          <div class="bg-gray-900/50 px-6 py-4 border-b border-gray-700 flex items-center gap-3">
            <div class="flex-shrink-0 flex items-center justify-center h-10 w-10 rounded-full bg-red-900/30 text-red-500">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 class="text-lg font-bold text-white">{{ title() }}</h3>
          </div>

          <!-- Body -->
          <div class="px-6 py-6">
            <p class="text-gray-300 text-sm leading-relaxed">
              {{ message() }}
            </p>
          </div>

          <!-- Footer -->
          <div class="bg-gray-900/30 px-6 py-4 flex flex-col sm:flex-row-reverse gap-2 sm:gap-3">
            <button 
              type="button" 
              (click)="confirm.emit()"
              class="w-full sm:w-auto inline-flex justify-center items-center rounded-lg border border-transparent px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 focus:ring-offset-gray-900 transition-colors sm:text-sm shadow-lg shadow-red-900/20"
            >
              {{ confirmText() }}
            </button>
            <button 
              type="button" 
              (click)="cancel.emit()"
              class="w-full sm:w-auto inline-flex justify-center items-center rounded-lg border border-gray-600 px-4 py-2 bg-transparent text-base font-medium text-gray-300 hover:bg-gray-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 focus:ring-offset-gray-900 transition-colors sm:text-sm"
            >
              {{ cancelText() }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    @keyframes scaleIn {
      from {
        opacity: 0;
        transform: scale(0.95) translateY(10px);
      }
      to {
        opacity: 1;
        transform: scale(1) translateY(0);
      }
    }
    .animate-scale-in {
      animation: scaleIn 0.2s ease-out forwards;
    }
  `]
})
export class ConfirmationModalComponent {
  isOpen = input.required<boolean>();
  title = input<string>('Confirm Action');
  message = input.required<string>();
  confirmText = input<string>('Delete');
  cancelText = input<string>('Cancel');
  
  confirm = output<void>();
  cancel = output<void>();
}

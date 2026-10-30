
import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-confirmation-modal',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './confirmation-modal.component.html',
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

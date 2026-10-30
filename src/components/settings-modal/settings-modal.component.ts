
import { Component, ChangeDetectionStrategy, input, output, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StorageService } from '../../services/storage.service';

@Component({
  selector: 'app-settings-modal',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings-modal.component.html'
})
export class SettingsModalComponent {
  private storageService = inject(StorageService);

  isOpen = input.required<boolean>();
  currentLanguage = input.required<string>();
  availableLanguages = input.required<{code: string, name: string}[]>();
  importStatusMessage = input<string | null>(null);
  canInstall = input<boolean>(false);

  close = output<void>();
  languageChange = output<string>();
  exportData = output<void>();
  triggerImport = output<void>();
  importData = output<File>();
  clearImportStatus = output<void>();
  installPwa = output<void>();

  storageStats = signal({ kb: '0.00', mb: '0.00', bytes: 0 });

  constructor() {
    effect(() => {
      // Re-calculate when modal is open.
      const isOpen = this.isOpen();
      const status = this.importStatusMessage();
      
      if (isOpen) {
        this.storageStats.set(this.storageService.getStorageUsage());
      }
    });
  }

  onLanguageChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    this.languageChange.emit(select.value);
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.importData.emit(input.files[0]);
      input.value = ''; // Reset
    }
  }
}

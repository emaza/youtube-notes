
import { Component, ChangeDetectionStrategy, input, output, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StorageService } from '../../services/storage.service';
import { SearchCacheService, MAX_SEARCH_CACHE_SIZE } from '../../services/search-cache.service';
import { APP_VERSION } from '../../utils/version';

@Component({
  selector: 'app-settings-modal',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings-modal.component.html'
})
export class SettingsModalComponent {
  private storageService = inject(StorageService);
  searchCache = inject(SearchCacheService);
  readonly maxSearchCacheSize = MAX_SEARCH_CACHE_SIZE;
  readonly version = APP_VERSION;

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

  onSearchCacheSizeChange(event: Event) {
    const input = event.target as HTMLInputElement;
    this.searchCache.setMaxSearches(Number(input.value));
    input.value = String(this.searchCache.maxSearches());
    this.storageStats.set(this.storageService.getStorageUsage());
  }

  clearSearchCache() {
    this.searchCache.clear();
    this.storageStats.set(this.storageService.getStorageUsage());
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.importData.emit(input.files[0]);
      input.value = ''; // Reset
    }
  }
}

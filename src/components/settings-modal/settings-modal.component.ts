
import { Component, ChangeDetectionStrategy, input, output, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StorageService } from '../../services/storage.service';
import { SpeechService, baseLang } from '../../services/speech.service';
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
  private speech = inject(SpeechService);
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

  /** Saved reading voice (`voiceURI`); empty means automatic. */
  voiceURI = signal(this.storageService.getAppSettings()?.voiceURI ?? '');
  /** Browser voices that speak the configured language (first one wins on a repeated voiceURI). */
  languageVoices = computed(() => {
    const base = baseLang(this.currentLanguage());
    const seen = new Set<string>();
    return this.speech.voices().filter(v => {
      if (baseLang(v.lang) !== base || seen.has(v.voiceURI)) return false;
      seen.add(v.voiceURI);
      return true;
    });
  });
  /**
   * The saved voice if it is listed for the configured language, else '' (automatic). The saved
   * value itself is kept, as the voices may not have loaded yet.
   */
  selectedVoiceURI = computed(() => {
    const saved = this.voiceURI();
    return this.languageVoices().some(v => v.voiceURI === saved) ? saved : '';
  });
  /** Show each voice's region only when the list mixes several (e.g. es-ES and es-MX). */
  showVoiceLang = computed(() => new Set(this.languageVoices().map(v => v.lang)).size > 1);
  /** Whether the voice preview is playing (the test button then stops it). */
  previewing = computed(() => this.speech.isPreviewing());

  constructor() {
    effect(() => {
      // Re-calculate when modal is open.
      const isOpen = this.isOpen();
      const status = this.importStatusMessage();
      
      if (isOpen) {
        this.storageStats.set(this.storageService.getStorageUsage());
      } else {
        this.speech.stopPreview();
      }
    });
  }

  /** Emits the new language, resetting the saved voice to automatic if it speaks another one. */
  onLanguageChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    this.speech.stopPreview();
    // A saved voice only makes sense for its own language.
    const voice = this.speech.voices().find(v => v.voiceURI === this.voiceURI());
    if (this.voiceURI() && (!voice || baseLang(voice.lang) !== baseLang(select.value))) {
      this.setVoice('');
    }
    this.languageChange.emit(select.value);
  }

  /** Saves the voice picked in the select ('' = automatic). */
  onVoiceChange(event: Event) {
    this.speech.stopPreview();
    this.setVoice((event.target as HTMLSelectElement).value);
  }

  /** Test voice button: reads a short phrase with the selected voice, or stops the running preview. */
  previewVoice() {
    if (this.previewing()) this.speech.stopPreview();
    else this.speech.previewVoice(this.selectedVoiceURI(), this.currentLanguage());
  }

  /** Updates and persists the reading voice; '' removes it from the settings. */
  private setVoice(voiceURI: string) {
    this.voiceURI.set(voiceURI);
    this.storageService.saveAppSettings({ voiceURI: voiceURI || undefined });
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

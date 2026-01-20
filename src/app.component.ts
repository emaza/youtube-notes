
import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WorkspaceService } from './services/workspace.service';
import { StorageService, SavedVideoSummary } from './services/storage.service';
import { PwaService } from './services/pwa.service';
import { ConfirmationModalComponent } from './components/confirmation-modal.component';
import { HeaderComponent } from './components/header.component';
import { SessionListComponent } from './components/session-list.component';
import { VideoPlayerComponent } from './components/video-player.component';
import { AssistantComponent } from './components/assistant.component';
import { SettingsModalComponent } from './components/settings-modal.component';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, 
    ConfirmationModalComponent,
    HeaderComponent,
    SessionListComponent,
    VideoPlayerComponent,
    AssistantComponent,
    SettingsModalComponent
  ],
})
export class AppComponent {
  // Services
  workspace = inject(WorkspaceService);
  storageService = inject(StorageService);
  pwaService = inject(PwaService);

  // Local UI State (Modals)
  isDeleteModalOpen = signal(false);
  videoToDeleteId = signal<string | null>(null);
  isSettingsModalOpen = signal(false);
  importStatusMessage = signal<string | null>(null);
  
  // Constants
  availableLanguages = [
    { code: 'es', name: 'Español' },
    { code: 'en', name: 'English' },
    { code: 'fr', name: 'Français' },
    { code: 'de', name: 'Deutsch' },
    { code: 'pt', name: 'Português' },
    { code: 'it', name: 'Italiano' }
  ];

  // --- Handlers ---

  onUrlChange(newUrl: string) {
    this.workspace.loadVideo(newUrl);
  }

  loadSavedVideo(summary: SavedVideoSummary) {
    const baseUrl = summary.type === 'short' ? 'https://www.youtube.com/shorts/' : 'https://www.youtube.com/watch?v=';
    this.workspace.loadVideo(`${baseUrl}${summary.videoId}`, summary.title, summary.type);
  }

  openDeleteModal(videoId: string) {
    this.videoToDeleteId.set(videoId);
    this.isDeleteModalOpen.set(true);
  }

  confirmDelete() {
    const id = this.videoToDeleteId();
    if (id) {
      this.workspace.deleteVideo(id);
    }
    this.isDeleteModalOpen.set(false);
    this.videoToDeleteId.set(null);
  }

  // --- Import/Export ---

  exportData() {
    const data = this.storageService.getBackupData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `yt-notetaker-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    window.URL.revokeObjectURL(url);
    this.isSettingsModalOpen.set(false);
  }

  triggerImport() {
    const fileInput = document.getElementById('importFile') as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  }

  onImportData(file: File | undefined) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const count = this.storageService.restoreBackupData(content);
        this.workspace.refreshSavedVideos();
        
        this.importStatusMessage.set(`Successfully restored ${count} sessions.`);
        
        // Reload current session if active
        const currentUrl = this.workspace.youtubeUrl();
        if (currentUrl) this.workspace.loadVideo(currentUrl);
        
      } catch (error) {
        this.importStatusMessage.set('Error importing file. Invalid JSON.');
      }
    };
    reader.readAsText(file);
  }
}

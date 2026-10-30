
import { Component, ChangeDetectionStrategy, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { WorkspaceService } from './services/workspace.service';
import { SessionListService } from './services/session-list.service';
import { StorageService, SavedVideoSummary } from './services/storage.service';
import { PwaService } from './services/pwa.service';
import { YouTubeSearchService, SearchResult } from './services/youtube-search.service';
import { ConfirmationModalComponent } from './components/confirmation-modal/confirmation-modal.component';
import { HeaderComponent } from './components/header/header.component';
import { SessionListComponent } from './components/session-list/session-list.component';
import { VideoPlayerComponent } from './components/video-player/video-player.component';
import { AssistantComponent } from './components/assistant/assistant.component';
import { NotesComponent } from './components/notes/notes.component';
import { SettingsModalComponent } from './components/settings-modal/settings-modal.component';
import { CommentsComponent } from './components/comments/comments.component';
import { SearchResultsComponent } from './components/search-results/search-results.component';
import { PersistPanelDirective } from './directives/persist-panel.directive';
import { buildVideoUrl, watchUrl } from './utils/youtube';
import { SearchFilters, normalizeFilters } from './utils/search';
import { LANGUAGES } from './utils/languages';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    DragDropModule,
    ConfirmationModalComponent,
    HeaderComponent,
    SessionListComponent,
    VideoPlayerComponent,
    AssistantComponent,
    NotesComponent,
    SettingsModalComponent,
    CommentsComponent,
    SearchResultsComponent,
    PersistPanelDirective
  ],
})
export class AppComponent {
  // Services
  workspace = inject(WorkspaceService);
  sessions = inject(SessionListService);
  storageService = inject(StorageService);
  pwaService = inject(PwaService);
  search = inject(YouTubeSearchService);

  // Local UI State
  isDeleteModalOpen = signal(false);
  videoToDeleteId = signal<string | null>(null);
  isSettingsModalOpen = signal(false);
  importStatusMessage = signal<string | null>(null);
  
  // Mobile Tabs State (on desktop chat, notes and comments are all visible)
  activeMobileTab = signal<'chat' | 'notes' | 'comments'>('chat');
  isShort = computed(() => this.workspace.currentVideoType() === 'short');
  layout = computed(() => this.isShort() ? 'short' : 'video');
  
  // Constants
  availableLanguages = LANGUAGES;

  // --- Handlers ---

  onUrlChange(newUrl: string) {
    this.workspace.loadVideo(newUrl);
  }

  /** Logo and the input's clear button: closes the video and the search. */
  goHome() {
    this.search.clear(false);
    this.workspace.resetWorkspace();
  }

  onSearch(filters: SearchFilters) {
    if (!normalizeFilters(filters)) return;
    this.workspace.closeVideo();
    this.search.search(filters);
  }

  openSearchResult(result: SearchResult) {
    this.workspace.loadVideo(watchUrl(result.videoId), result.title);
  }

  saveSearchResult(result: SearchResult) {
    const channelUrl = result.channelId ? `https://www.youtube.com/channel/${result.channelId}` : '';
    this.sessions.save(result.videoId, result.title, result.channelTitle, channelUrl);
  }

  loadSavedVideo(summary: SavedVideoSummary) {
    this.workspace.loadVideo(buildVideoUrl(summary.videoId, summary.type), summary.title, summary.type);
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
        this.sessions.refresh();
        
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

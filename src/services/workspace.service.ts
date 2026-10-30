
import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { GeminiService, ChatMessage } from './gemini.service';
import { StorageService, SavedVideoSummary, VideoType } from './storage.service';

@Injectable({
  providedIn: 'root'
})
export class WorkspaceService {
  private http: HttpClient = inject(HttpClient);
  private geminiService = inject(GeminiService);
  private storageService = inject(StorageService);

  // --- State Signals ---
  youtubeUrl = signal<string>('');
  notes = signal<string>('');
  messages = signal<ChatMessage[]>([]);
  
  // Metadata
  currentVideoTitle = signal<string>('');
  currentChannelTitle = signal<string>('');
  currentChannelUrl = signal<string>('');
  currentVideoType = signal<VideoType>('video');
  
  // UI State
  isAiThinking = signal(false);
  chatError = signal<string | null>(null);
  showSummaryButton = signal(true);
  
  // Settings
  currentLanguage = signal<string>('es');
  
  // Collection State
  savedVideos = signal<SavedVideoSummary[]>([]);
  searchQuery = signal<string>('');
  typeFilter = signal<'all' | 'video' | 'short'>('all');
  currentPage = signal(1);
  readonly ITEMS_PER_PAGE = 12;

  // --- Computed ---
  videoId = computed(() => {
    const url = this.youtubeUrl();
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2] && match[2].length === 11) ? match[2] : null;
  });

  filteredVideos = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const type = this.typeFilter();
    let items = this.savedVideos();
    
    if (type !== 'all') {
      items = items.filter(v => v.type === type);
    }

    if (!query) return items;

    return items.filter(v => 
      v.title.toLowerCase().includes(query) || 
      (v.channelTitle && v.channelTitle.toLowerCase().includes(query))
    );
  });

  totalPages = computed(() => Math.ceil(this.filteredVideos().length / this.ITEMS_PER_PAGE));
  
  paginatedVideos = computed(() => {
    const videos = this.filteredVideos();
    const total = this.totalPages();
    let page = this.currentPage();

    // Defensive check: If current page is beyond total pages (e.g. after filtering), use page 1 for slicing
    if (page > total && total > 0) {
      page = 1;
    }

    const startIndex = (page - 1) * this.ITEMS_PER_PAGE;
    
    // Safety check
    if (videos.length === 0) return [];
    
    return videos.slice(startIndex, startIndex + this.ITEMS_PER_PAGE);
  });

  constructor() {
    this.initializeLanguage();
    this.refreshSavedVideos();
    this.checkUrlParams();
  }

  // --- URL Management ---

  private checkUrlParams() {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const vId = params.get('v');
    const typeParam = params.get('type');
    // Validate type
    const type: VideoType = (typeParam === 'short' || typeParam === 'video') ? typeParam : 'video';

    if (vId) {
      // Reconstruct a valid YouTube URL to trigger the loading logic
      const baseUrl = type === 'short' ? 'https://www.youtube.com/shorts/' : 'https://www.youtube.com/watch?v=';
      this.loadVideo(`${baseUrl}${vId}`, undefined, type);
    }
  }

  private updateBrowserUrl(videoId: string, type: VideoType) {
    if (typeof window === 'undefined') return;
    
    const url = new URL(window.location.href);
    url.searchParams.set('v', videoId);
    url.searchParams.set('type', type);
    window.history.replaceState({}, '', url.toString());
  }

  private clearBrowserUrl() {
    if (typeof window === 'undefined') return;
    
    const url = new URL(window.location.href);
    url.searchParams.delete('v');
    url.searchParams.delete('type');
    window.history.replaceState({}, '', url.toString());
  }

  // --- Actions ---

  setSearchQuery(query: string) {
    this.searchQuery.set(query);
    this.currentPage.set(1);
  }

  setTypeFilter(type: 'all' | 'video' | 'short') {
    this.typeFilter.set(type);
    this.currentPage.set(1);
  }

  initializeLanguage() {
    const saved = this.storageService.getAppSettings();
    if (saved?.language) {
      this.currentLanguage.set(saved.language);
    } else if (typeof navigator !== 'undefined') {
      const browserLang = navigator.language.split('-')[0];
      const supported = ['es', 'en', 'fr', 'de', 'pt', 'it'];
      this.currentLanguage.set(supported.includes(browserLang) ? browserLang : 'es');
    }
  }

  setLanguage(lang: string) {
    this.currentLanguage.set(lang);
    this.storageService.saveAppSettings({ language: lang });
    
    // Restart chat context if active
    const vId = this.videoId();
    if (vId) {
      this.geminiService.startChat(
        `https://www.youtube.com/watch?v=${vId}`, vId, this.currentVideoTitle(), this.messages(), lang
      );
    }
  }

  refreshSavedVideos() {
    this.savedVideos.set(this.storageService.getAllSavedVideos());
  }

  async loadVideo(url: string, knownTitle?: string, knownType?: VideoType) {
    this.youtubeUrl.set(url);
    
    // Determine Type logic
    // We check URL pattern, but we don't set the signal yet if it's a new video
    // because resetWorkspace() below would overwrite it to 'video'.
    const isShort = url.includes('/shorts/');
    const finalType = knownType || (isShort ? 'short' : 'video');

    const vId = this.videoId();
    if (!vId) {
      this.resetWorkspace();
      return;
    }

    // Update Browser URL
    this.updateBrowserUrl(vId, finalType);

    // Load Data
    this.chatError.set(null);
    this.showSummaryButton.set(true);
    
    const savedData = this.storageService.getVideoData(vId);
    
    if (savedData) {
      this.notes.set(savedData.notes);
      this.messages.set(savedData.messages);
      this.currentVideoTitle.set(savedData.title);
      this.currentChannelTitle.set(savedData.channelTitle || '');
      this.currentChannelUrl.set(savedData.channelUrl || '');
      this.currentVideoType.set(savedData.type || finalType);
    } else {
      this.resetWorkspace(false); // Don't clear URL
      // Set type AFTER reset, otherwise resetWorkspace sets it to 'video'
      this.currentVideoType.set(finalType); 
      this.currentVideoTitle.set(knownTitle || '');
    }

    // Metadata Fetch if missing
    if (!this.currentVideoTitle() || !this.currentChannelTitle()) {
      await this.fetchMetadata(vId);
    }

    // Start Session
    if (this.currentVideoTitle()) {
      this.saveCurrentState();
      this.refreshSavedVideos();
    }

    this.geminiService.startChat(
      `https://www.youtube.com/watch?v=${vId}`, vId, this.currentVideoTitle(), this.messages(), this.currentLanguage()
    );
  }

  private async fetchMetadata(vId: string) {
    try {
      const oembedUrl = `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${vId}`;
      const data: any = await firstValueFrom(this.http.get(oembedUrl));
      
      if (data.title) this.currentVideoTitle.set(data.title);
      if (data.author_name) {
        this.currentChannelTitle.set(data.author_name);
        this.currentChannelUrl.set(data.author_url || '');
      }
    } catch (e) {
      console.warn('Metadata fetch failed', e);
    }
  }

  saveCurrentState() {
    const vId = this.videoId();
    if (!vId) return;

    this.storageService.saveVideoData(
      vId, 
      this.currentVideoTitle(), 
      this.notes(), 
      this.messages(),
      this.currentChannelTitle(),
      this.currentChannelUrl(),
      this.currentVideoType()
    );
  }

  updateNotes(text: string) {
    this.notes.set(text);
    this.saveCurrentState();
  }

  async sendMessage(text: string) {
    const vId = this.videoId();
    if (!vId) return;

    this.messages.update(p => [...p, { role: 'user', text }]);
    this.saveCurrentState();
    this.isAiThinking.set(true);
    this.chatError.set(null);

    let streaming = false;
    const setModelMessage = (msg: ChatMessage) => {
      if (this.videoId() !== vId) return;
      this.messages.update(p => streaming ? [...p.slice(0, -1), msg] : [...p, msg]);
      streaming = true;
    };

    try {
      const response = await this.geminiService.sendMessage(text, partial => {
        setModelMessage({ role: 'model', text: partial });
        this.isAiThinking.set(false);
      });
      setModelMessage(response);
      if (this.videoId() === vId) this.saveCurrentState();
    } catch (error: any) {
      if (streaming && this.videoId() === vId) this.messages.update(p => p.slice(0, -1));
      this.chatError.set(error.message || 'Error communicating with AI');
    } finally {
      this.isAiThinking.set(false);
    }
  }

  async generateSummary() {
    this.showSummaryButton.set(false);
    await this.sendMessage("Generate a detailed summary of this video.");
  }

  deleteVideo(id: string) {
    this.storageService.deleteVideoData(id);
    this.refreshSavedVideos();
    if (this.videoId() === id) {
      this.youtubeUrl.set('');
      this.resetWorkspace();
    }
  }

  resetWorkspace(clearUrl = true) {
    if (clearUrl) {
      this.youtubeUrl.set('');
      this.clearBrowserUrl();
    }
    this.messages.set([]);
    this.notes.set('');
    this.currentVideoTitle.set('');
    this.currentChannelTitle.set('');
    this.currentChannelUrl.set('');
    this.chatError.set(null);
    this.showSummaryButton.set(true);
    this.currentVideoType.set('video');
    this.currentPage.set(1);
  }
}

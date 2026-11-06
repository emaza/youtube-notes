import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { GeminiService, ChatMessage } from './gemini.service';
import { StorageService, VideoType } from './storage.service';
import { SessionListService } from './session-list.service';
import { BrowserUrlService } from './browser-url.service';
import { extractVideoId, buildVideoUrl, watchUrl } from '../utils/youtube';
import { DEFAULT_LANGUAGE, isSupportedLanguage } from '../utils/languages';

/** The open video: its notes, AI chat and metadata, plus the answer language. */
@Injectable({
  providedIn: 'root'
})
export class WorkspaceService {
  private http: HttpClient = inject(HttpClient);
  private geminiService = inject(GeminiService);
  private storageService = inject(StorageService);
  private sessions = inject(SessionListService);
  private browserUrl = inject(BrowserUrlService);

  // --- State ---

  youtubeUrl = signal<string>('');
  notes = signal<string>('');
  messages = signal<ChatMessage[]>([]);

  // Metadata
  currentVideoTitle = signal<string>('');
  currentChannelTitle = signal<string>('');
  currentChannelUrl = signal<string>('');
  currentVideoType = signal<VideoType>('video');

  // Chat UI state
  isAiThinking = signal(false);
  isStreaming = signal(false);
  chatError = signal<string | null>(null);
  showSummaryButton = signal(true);

  // Settings
  currentLanguage = signal<string>(DEFAULT_LANGUAGE);

  videoId = computed(() => {
    const url = this.youtubeUrl();
    return url ? extractVideoId(url) : null;
  });

  constructor() {
    this.initializeLanguage();
    this.loadFromUrl();

    // Back/forward: the URL has already changed, so restore the state it describes.
    this.browserUrl.onNavigate(() => this.loadFromUrl());
  }

  // --- Language ---

  initializeLanguage() {
    const saved = this.storageService.getAppSettings();
    if (saved?.language) {
      this.currentLanguage.set(saved.language);
    } else if (typeof navigator !== 'undefined') {
      const browserLang = navigator.language.split('-')[0];
      this.currentLanguage.set(isSupportedLanguage(browserLang) ? browserLang : DEFAULT_LANGUAGE);
    }
  }

  setLanguage(lang: string) {
    this.currentLanguage.set(lang);
    this.storageService.saveAppSettings({ language: lang });

    // Restart chat context if active
    const vId = this.videoId();
    if (vId) {
      this.geminiService.startChat(watchUrl(vId), vId, this.currentVideoTitle(), this.messages(), lang);
    }
  }

  // --- Navigation ---

  /**
   * Opens the video in the URL (/watch?v=, /shorts/ID); when there is none, closes the open
   * video without touching the URL (it may hold a search).
   */
  private loadFromUrl() {
    const fromUrl = this.browserUrl.read();
    if (fromUrl) {
      this.loadVideo(buildVideoUrl(fromUrl.videoId, fromUrl.type), undefined, fromUrl.type);
    } else if (this.videoId()) {
      this.closeVideo();
    }
  }

  /** Closes the open video leaving the browser URL as it is. */
  closeVideo() {
    this.youtubeUrl.set('');
    this.resetWorkspace(false);
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

    this.browserUrl.showVideo(vId, finalType);

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
      this.sessions.refresh();
    }

    this.geminiService.startChat(watchUrl(vId), vId, this.currentVideoTitle(), this.messages(), this.currentLanguage());
  }

  resetWorkspace(clearUrl = true) {
    if (clearUrl) {
      this.youtubeUrl.set('');
      this.browserUrl.clear();
    }
    this.messages.set([]);
    this.notes.set('');
    this.currentVideoTitle.set('');
    this.currentChannelTitle.set('');
    this.currentChannelUrl.set('');
    this.chatError.set(null);
    this.showSummaryButton.set(true);
    this.currentVideoType.set('video');
    this.sessions.currentPage.set(1);
  }

  deleteVideo(id: string) {
    this.storageService.deleteVideoData(id);
    this.sessions.refresh();
    if (this.videoId() === id) {
      this.youtubeUrl.set('');
      this.resetWorkspace();
    }
  }

  // --- Metadata and persistence ---

  private async fetchMetadata(vId: string) {
    try {
      const oembedUrl = `https://noembed.com/embed?url=${watchUrl(vId)}`;
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

  // --- Notes ---

  updateNotes(text: string) {
    this.notes.set(text);
    this.saveCurrentState();
  }

  // --- Chat ---

  async sendMessage(text: string) {
    const vId = this.videoId();
    if (!vId) return;

    this.messages.update(p => [...p, { role: 'user', text }]);
    this.saveCurrentState();
    this.isAiThinking.set(true);
    this.isStreaming.set(true);
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
      this.isStreaming.set(false);
    }
  }

  async generateSummary() {
    this.showSummaryButton.set(false);
    await this.sendMessage("Generate a detailed summary of this video.");
  }
}

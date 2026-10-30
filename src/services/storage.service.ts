
import { Injectable } from '@angular/core';
import { ChatMessage } from './gemini.service';

export type VideoType = 'video' | 'short';

export interface VideoData {
  title: string;
  channelTitle?: string;
  channelUrl?: string;
  notes: string;
  messages: ChatMessage[];
  lastUpdated: number;
  type?: VideoType; 
}

export interface SavedVideoSummary {
  videoId: string;
  title: string;
  channelTitle?: string;
  lastUpdated: number;
  type: VideoType;
}

export interface AppSettings {
  language?: string;
  /** Max searches kept in the local search cache (0 disables it). */
  searchCacheSize?: number;
}

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  private readonly STORAGE_PREFIX = 'yt-notetaker-';
  private readonly SETTINGS_KEY = 'yt-notetaker-settings';

  private getKey(videoId: string): string {
    return `${this.STORAGE_PREFIX}${videoId}`;
  }

  // --- APP SETTINGS ---

  /** Merges the given settings into the saved ones. */
  saveAppSettings(settings: AppSettings): void {
    try {
      localStorage.setItem(this.SETTINGS_KEY, JSON.stringify({ ...this.getAppSettings(), ...settings }));
    } catch (e) {
      console.error('Error saving settings', e);
    }
  }

  getAppSettings(): AppSettings | null {
    try {
      const item = localStorage.getItem(this.SETTINGS_KEY);
      if (!item) return null;
      return JSON.parse(item) as AppSettings;
    } catch (e) {
      console.error('Error reading settings', e);
      return null;
    }
  }

  // --- VIDEO DATA ---

  saveVideoData(
    videoId: string, 
    title: string, 
    notes: string, 
    messages: ChatMessage[],
    channelTitle?: string,
    channelUrl?: string,
    type: VideoType = 'video'
  ): void {
    if (!videoId) return;
    
    const data: VideoData = {
      title,
      channelTitle,
      channelUrl,
      notes,
      messages,
      lastUpdated: Date.now(),
      type
    };

    try {
      localStorage.setItem(this.getKey(videoId), JSON.stringify(data));
    } catch (e) {
      console.error('Error saving to localStorage', e);
    }
  }

  getVideoData(videoId: string): VideoData | null {
    if (!videoId) return null;

    try {
      const item = localStorage.getItem(this.getKey(videoId));
      if (!item) return null;
      return JSON.parse(item) as VideoData;
    } catch (e) {
      console.error('Error reading from localStorage', e);
      return null;
    }
  }

  getAllSavedVideos(): SavedVideoSummary[] {
    const videos: SavedVideoSummary[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        // Ensure we don't pick up the settings key or other unrelated keys
        if (key && key.startsWith(this.STORAGE_PREFIX) && key !== this.SETTINGS_KEY) {
          const videoId = key.replace(this.STORAGE_PREFIX, '');
          const item = localStorage.getItem(key);
          if (item) {
            try {
              const data = JSON.parse(item) as VideoData;
              // Basic check to ensure it has video data structure
              if (data && typeof data === 'object') {
                videos.push({
                  videoId,
                  title: data.title || 'Untitled Video',
                  channelTitle: data.channelTitle,
                  lastUpdated: data.lastUpdated || 0,
                  type: data.type || 'video'
                });
              }
            } catch (parseError) {
              console.warn(`Skipping invalid JSON for key ${key}`, parseError);
            }
          }
        }
      }
    } catch (e) {
      console.error('Error listing saved videos', e);
    }
    // Sort by newest first
    return videos.sort((a, b) => b.lastUpdated - a.lastUpdated);
  }

  deleteVideoData(videoId: string): void {
    if (!videoId) return;
    localStorage.removeItem(this.getKey(videoId));
  }

  /**
   * Returns a JSON string containing all app-specific data from localStorage
   */
  getBackupData(): string {
    const backup: Record<string, VideoData> = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        // Exclude settings from backup of video data
        if (key && key.startsWith(this.STORAGE_PREFIX) && key !== this.SETTINGS_KEY) {
          const item = localStorage.getItem(key);
          if (item) {
             const videoId = key.replace(this.STORAGE_PREFIX, '');
             backup[videoId] = JSON.parse(item);
          }
        }
      }
    } catch (e) {
      console.error('Error creating backup', e);
    }
    return JSON.stringify(backup, null, 2);
  }

  /**
   * Restores data from a JSON string. Returns the number of items restored.
   */
  restoreBackupData(jsonStr: string): number {
    let count = 0;
    try {
      const backup = JSON.parse(jsonStr);
      if (typeof backup !== 'object' || backup === null) {
        throw new Error('Invalid backup format');
      }

      Object.keys(backup).forEach(videoId => {
        const data = backup[videoId];
        // Basic validation to ensure it looks like our data
        if (data && typeof data === 'object' && 'notes' in data) {
           localStorage.setItem(this.getKey(videoId), JSON.stringify(data));
           count++;
        }
      });
    } catch (e) {
      console.error('Error restoring backup', e);
      throw e;
    }
    return count;
  }

  /**
   * Calculates the approximate size of data in localStorage
   */
  getStorageUsage() {
    let total = 0;
    for (let x in localStorage) {
      if (localStorage.hasOwnProperty(x)) {
        const item = localStorage.getItem(x);
        // (Key length + Value length) * 2 bytes (UTF-16)
        total += ((item ? item.length : 0) + x.length) * 2;
      }
    }
    
    return {
      bytes: total,
      kb: (total / 1024).toFixed(2),
      mb: (total / (1024 * 1024)).toFixed(2)
    };
  }
}

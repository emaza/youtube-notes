import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface YouTubeComment {
  id: string;
  author: string;
  authorAvatar: string;
  authorChannelUrl: string;
  text: string;
  likeCount: number;
  publishedAt: string;
  replyCount: number;
}

export interface CommentsPage {
  comments: YouTubeComment[];
  nextPageToken: string | null;
  disabled?: boolean;
}

export type CommentsOrder = 'relevance' | 'time';

/**
 * Reads YouTube comments through our own backend (`/api/comments`), so the
 * YouTube API key never reaches the browser.
 */
@Injectable({
  providedIn: 'root'
})
export class YouTubeCommentsService {
  private http = inject(HttpClient);

  getComments(videoId: string, order: CommentsOrder, pageToken?: string | null): Promise<CommentsPage> {
    const params: Record<string, string> = { videoId, order };
    if (pageToken) params['pageToken'] = pageToken;
    return this.request('/api/comments', params);
  }

  getReplies(parentId: string, pageToken?: string | null): Promise<CommentsPage> {
    const params: Record<string, string> = { parentId };
    if (pageToken) params['pageToken'] = pageToken;
    return this.request('/api/comments/replies', params);
  }

  private async request(url: string, params: Record<string, string>): Promise<CommentsPage> {
    try {
      return await firstValueFrom(this.http.get<CommentsPage>(url, { params }));
    } catch (e) {
      const message = e instanceof HttpErrorResponse ? e.error?.error : null;
      throw new Error(message || 'Could not load the comments.');
    }
  }
}

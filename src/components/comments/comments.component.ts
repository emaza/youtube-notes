import { Component, ChangeDetectionStrategy, input, signal, effect, inject, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { PersistPanelDirective } from '../../directives/persist-panel.directive';
import { YouTubeCommentsService, YouTubeComment, CommentsOrder } from '../../services/youtube-comments.service';

interface RepliesState {
  open: boolean;
  loading: boolean;
  error: string | null;
  items: YouTubeComment[];
  nextPageToken: string | null;
}

@Component({
  selector: 'app-comments',
  standalone: true,
  imports: [CommonModule, DragDropModule, PersistPanelDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './comments.component.html'
})
export class CommentsComponent {
  private commentsService = inject(YouTubeCommentsService);

  videoId = input.required<string>();
  /** Layout the panel lives in ('video' | 'short'); positions are remembered per layout. */
  layout = input('video');

  readonly orderOptions: { value: CommentsOrder; label: string }[] = [
    { value: 'relevance', label: 'Relevant' },
    { value: 'time', label: 'Recent' }
  ];

  order = signal<CommentsOrder>('relevance');
  comments = signal<YouTubeComment[]>([]);
  nextPageToken = signal<string | null>(null);
  loading = signal(false);
  loaded = signal(false);
  /** True once the user has asked to load comments for the current video. */
  requested = signal(false);
  error = signal<string | null>(null);
  disabled = signal(false);
  replies = signal<Record<string, RepliesState>>({});

  // Each reload bumps this so responses from a previous video/order are discarded.
  private requestId = 0;

  constructor() {
    // Navigating to another video goes back to the initial state: nothing is fetched until requested.
    effect(() => {
      this.videoId();
      untracked(() => this.reset());
    });
  }

  setOrder(order: CommentsOrder) {
    if (order === this.order()) return;
    this.order.set(order);
    if (this.requested()) this.reload();
  }

  requestLoad() {
    this.requested.set(true);
    this.reload();
  }

  private reset() {
    this.requestId++;
    this.requested.set(false);
    this.comments.set([]);
    this.nextPageToken.set(null);
    this.replies.set({});
    this.disabled.set(false);
    this.loaded.set(false);
    this.loading.set(false);
    this.error.set(null);
  }

  reload() {
    this.requestId++;
    this.comments.set([]);
    this.nextPageToken.set(null);
    this.replies.set({});
    this.disabled.set(false);
    this.loaded.set(false);
    this.loadMore();
  }

  async loadMore() {
    const id = this.requestId;
    this.loading.set(true);
    this.error.set(null);
    try {
      const page = await this.commentsService.getComments(this.videoId(), this.order(), this.nextPageToken());
      if (id !== this.requestId) return;
      this.comments.update(list => [...list, ...page.comments]);
      this.nextPageToken.set(page.nextPageToken);
      this.disabled.set(!!page.disabled);
    } catch (e: any) {
      if (id === this.requestId) this.error.set(e.message);
    } finally {
      if (id === this.requestId) {
        this.loading.set(false);
        this.loaded.set(true);
      }
    }
  }

  toggleReplies(commentId: string) {
    const state = this.replies()[commentId];
    if (state) {
      this.patchReplies(commentId, { open: !state.open });
    } else {
      this.loadReplies(commentId);
    }
  }

  async loadReplies(commentId: string) {
    const id = this.requestId;
    const current = this.replies()[commentId];
    this.patchReplies(commentId, {
      open: true, loading: true, error: null,
      items: current?.items ?? [], nextPageToken: current?.nextPageToken ?? null
    });
    try {
      const page = await this.commentsService.getReplies(commentId, current?.nextPageToken);
      if (id !== this.requestId) return;
      // The API returns replies newest first; show them in conversation order.
      const items = [...(current?.items ?? []), ...page.comments];
      items.sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
      this.patchReplies(commentId, { loading: false, items, nextPageToken: page.nextPageToken });
    } catch (e: any) {
      if (id === this.requestId) this.patchReplies(commentId, { loading: false, error: e.message });
    }
  }

  timeAgo(iso: string): string {
    const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
    if (!isFinite(seconds)) return '';
    const units: [Intl.RelativeTimeFormatUnit, number][] = [
      ['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]
    ];
    const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
    for (const [unit, size] of units) {
      if (seconds >= size) return rtf.format(-Math.floor(seconds / size), unit);
    }
    return rtf.format(0, 'second');
  }

  private patchReplies(commentId: string, patch: Partial<RepliesState>) {
    this.replies.update(all => ({ ...all, [commentId]: { ...all[commentId], ...patch } as RepliesState }));
  }
}

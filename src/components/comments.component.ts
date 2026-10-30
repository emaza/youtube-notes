import { Component, ChangeDetectionStrategy, input, signal, effect, inject, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { YouTubeCommentsService, YouTubeComment, CommentsOrder } from '../services/youtube-comments.service';

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
  imports: [CommonModule, DragDropModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      cdkDrag
      cdkDragBoundary="body"
      class="bg-gray-800/80 backdrop-blur-md rounded-xl shadow-2xl ring-1 ring-white/10 flex flex-col group hover:shadow-red-500/20 resize overflow-hidden w-full h-full relative z-50"
    >
      <!-- Header (Drag Handle) -->
      <div cdkDragHandle class="p-3 sm:p-4 bg-gray-900/90 flex items-center justify-between shrink-0 border-b border-gray-700 select-none cursor-move">
        <h2 class="font-bold text-base sm:text-lg text-white flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-red-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clip-rule="evenodd" />
          </svg>
          Comments
        </h2>
        <div class="flex items-center gap-1 shrink-0" (pointerdown)="$event.stopPropagation()">
          @for (opt of orderOptions; track opt.value) {
            <button
              (click)="setOrder(opt.value)"
              class="text-xs px-2 py-1 rounded transition-colors cursor-pointer"
              [class.bg-gray-700]="order() === opt.value"
              [class.text-white]="order() === opt.value"
              [class.text-gray-400]="order() !== opt.value"
              [class.hover:text-white]="order() !== opt.value"
            >{{ opt.label }}</button>
          }
        </div>
      </div>

      <!-- Comments List -->
      <div class="flex-grow overflow-y-auto custom-scrollbar bg-gray-900/40 min-h-0 p-4 space-y-4">
        @if (disabled()) {
          <p class="text-sm text-gray-400 text-center py-8">Los comentarios están desactivados en este vídeo.</p>
        } @else if (error() && comments().length === 0) {
          <div class="text-sm text-red-400 text-center py-8 space-y-3">
            <p>{{ error() }}</p>
            <button (click)="reload()" class="text-xs px-3 py-1 rounded bg-gray-700 text-white hover:bg-gray-600 cursor-pointer">Reintentar</button>
          </div>
        } @else if (!loading() && loaded() && comments().length === 0) {
          <p class="text-sm text-gray-400 text-center py-8">Este vídeo no tiene comentarios.</p>
        }

        @for (comment of comments(); track comment.id) {
          <div class="flex gap-3">
            <ng-container *ngTemplateOutlet="commentTpl; context: { $implicit: comment }"></ng-container>
          </div>

          @if (comment.replyCount > 0) {
            @let r = replies()[comment.id];
            <div class="ml-11">
              <button
                (click)="toggleReplies(comment.id)"
                class="text-xs font-medium text-blue-400 hover:text-blue-300 cursor-pointer flex items-center gap-1"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 transition-transform" [class.rotate-180]="r?.open" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
                </svg>
                {{ r?.open ? 'Ocultar respuestas' : 'Ver ' + comment.replyCount + (comment.replyCount === 1 ? ' respuesta' : ' respuestas') }}
              </button>

              @if (r?.open) {
                <div class="mt-3 space-y-3">
                  @for (reply of r.items; track reply.id) {
                    <div class="flex gap-3">
                      <ng-container *ngTemplateOutlet="commentTpl; context: { $implicit: reply }"></ng-container>
                    </div>
                  }
                  @if (r.loading) {
                    <p class="text-xs text-gray-500">Cargando respuestas...</p>
                  } @else if (r.error) {
                    <p class="text-xs text-red-400">{{ r.error }}</p>
                  } @else if (r.nextPageToken) {
                    <button (click)="loadReplies(comment.id)" class="text-xs text-blue-400 hover:text-blue-300 cursor-pointer">Más respuestas</button>
                  }
                </div>
              }
            </div>
          }
        }

        @if (loading()) {
          <p class="text-sm text-gray-500 text-center py-4">Cargando comentarios...</p>
        } @else if (error() && comments().length > 0) {
          <p class="text-sm text-red-400 text-center py-2">{{ error() }}</p>
        }

        @if (!loading() && nextPageToken()) {
          <div class="text-center pt-2">
            <button (click)="loadMore()" class="text-sm px-4 py-1.5 rounded-md bg-gray-700 text-white hover:bg-gray-600 cursor-pointer">Cargar más</button>
          </div>
        }
      </div>

      <!-- Footer Resize Handle -->
      <div class="h-6 bg-gray-900/90 border-t border-gray-700 shrink-0 flex justify-end items-center px-2 cursor-nwse-resize select-none hidden lg:flex">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-500 opacity-80" viewBox="0 0 20 20" fill="currentColor">
            <path d="M16 16L10 10M16 12V16H12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
      </div>
    </div>

    <ng-template #commentTpl let-c>
      <img [src]="c.authorAvatar" alt="" class="h-8 w-8 rounded-full shrink-0 bg-gray-700" referrerpolicy="no-referrer" loading="lazy">
      <div class="min-w-0 flex-1">
        <div class="flex items-baseline gap-2 text-xs">
          @if (c.authorChannelUrl) {
            <a [href]="c.authorChannelUrl" target="_blank" rel="noopener noreferrer" class="font-semibold text-gray-200 hover:underline truncate">{{ c.author }}</a>
          } @else {
            <span class="font-semibold text-gray-200 truncate">{{ c.author }}</span>
          }
          <span class="text-gray-500 shrink-0" [title]="c.publishedAt | date:'medium'">{{ timeAgo(c.publishedAt) }}</span>
        </div>
        <p class="text-sm text-gray-300 whitespace-pre-wrap break-words select-text mt-0.5">{{ c.text }}</p>
        @if (c.likeCount > 0) {
          <div class="flex items-center gap-1 text-xs text-gray-500 mt-1">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
            </svg>
            {{ c.likeCount | number }}
          </div>
        }
      </div>
    </ng-template>
  `
})
export class CommentsComponent {
  private commentsService = inject(YouTubeCommentsService);

  videoId = input.required<string>();

  readonly orderOptions: { value: CommentsOrder; label: string }[] = [
    { value: 'relevance', label: 'Relevantes' },
    { value: 'time', label: 'Recientes' }
  ];

  order = signal<CommentsOrder>('relevance');
  comments = signal<YouTubeComment[]>([]);
  nextPageToken = signal<string | null>(null);
  loading = signal(false);
  loaded = signal(false);
  error = signal<string | null>(null);
  disabled = signal(false);
  replies = signal<Record<string, RepliesState>>({});

  // Each reload bumps this so responses from a previous video/order are discarded.
  private requestId = 0;

  constructor() {
    effect(() => {
      this.videoId();
      this.order();
      untracked(() => this.reload());
    });
  }

  setOrder(order: CommentsOrder) {
    this.order.set(order);
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

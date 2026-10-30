import { Directive, ElementRef, effect, inject, input, untracked, DestroyRef } from '@angular/core';
import { CdkDrag } from '@angular/cdk/drag-drop';
import { PanelLayoutService } from '../services/panel-layout.service';

// Panels brought to front stack above the panels' own z-index (up to z-50) and
// below the modals (z-[100]).
const STACKED_BASE_Z_INDEX = 51;

/**
 * Persists the drag position (cdkDrag) and the user-resized size (CSS `resize`)
 * of a panel under the given key, and restores them when the panel is created
 * again or the key changes. Must be placed on the same element as `cdkDrag`.
 */
@Directive({
  selector: '[appPersistPanel]',
  standalone: true
})
export class PersistPanelDirective {
  key = input.required<string>({ alias: 'appPersistPanel' });

  private drag = inject(CdkDrag);
  private el: HTMLElement = inject(ElementRef).nativeElement;
  private layouts = inject(PanelLayoutService);

  constructor() {
    // Restore on creation and whenever the key changes (e.g. video <-> short layout).
    effect(() => {
      const key = this.key();
      untracked(() => this.restore(key));
    });

    // Like windows: clicking or dragging a panel brings it on top, the rest keep
    // their order. Capture phase, because some inner controls stop propagation.
    effect(() => {
      const index = this.layouts.stackOrder().indexOf(this.key());
      this.el.style.zIndex = index === -1 ? '' : String(STACKED_BASE_Z_INDEX + index);
    });
    const bringToFront = () => this.layouts.bringToFront(this.key());
    this.el.addEventListener('pointerdown', bringToFront, { capture: true });

    const dragEnded = this.drag.ended.subscribe(({ source }) => {
      this.layouts.savePosition(this.key(), source.getFreeDragPosition());
    });

    // The native CSS resize handle writes inline width/height, so watching the
    // style attribute captures only user resizes (not responsive layout changes).
    const observer = new MutationObserver(() => {
      const { width, height } = this.el.style;
      if (width || height) this.layouts.saveSize(this.key(), { width, height });
    });
    observer.observe(this.el, { attributes: true, attributeFilter: ['style'] });

    inject(DestroyRef).onDestroy(() => {
      this.el.removeEventListener('pointerdown', bringToFront, { capture: true });
      dragEnded.unsubscribe();
      observer.disconnect();
    });
  }

  private restore(key: string) {
    const saved = this.layouts.get(key);

    if (saved?.x !== undefined && saved.y !== undefined) {
      this.drag.setFreeDragPosition({ x: saved.x, y: saved.y });
    } else {
      this.drag.reset();
    }

    this.el.style.width = saved?.width ?? '';
    this.el.style.height = saved?.height ?? '';
  }
}

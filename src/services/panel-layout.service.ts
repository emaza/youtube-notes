import { Injectable, signal } from '@angular/core';

export interface PanelLayout {
  x?: number;
  y?: number;
  width?: string;
  height?: string;
}

/**
 * Remembers where the user dragged/resized each panel. Kept in memory only, so
 * it survives navigating between videos but resets on page reload.
 */
@Injectable({
  providedIn: 'root'
})
export class PanelLayoutService {
  private layouts = new Map<string, PanelLayout>();
  /** Dragged panels, from the one dragged longest ago to the most recent (on top). */
  readonly dragOrder = signal<string[]>([]);

  bringToFront(key: string) {
    this.dragOrder.update(order => [...order.filter(k => k !== key), key]);
  }

  get(key: string): PanelLayout | undefined {
    return this.layouts.get(key);
  }

  savePosition(key: string, position: { x: number; y: number }) {
    this.layouts.set(key, { ...this.layouts.get(key), ...position });
  }

  saveSize(key: string, size: { width: string; height: string }) {
    this.layouts.set(key, { ...this.layouts.get(key), ...size });
  }
}

import { Injectable, computed, signal } from '@angular/core';
import type { TimelineSegment } from '../models/timeline';

@Injectable({ providedIn: 'root' })
export class AppStateService {
  readonly minDepth = 0;
  readonly maxDepth = 1000;

  readonly zoomDepth = signal(0);
  readonly activeSegmentId = signal<string | null>(null);
  readonly activeProjectSlug = signal<string | null>(null);

  /** True while a programmatic jump animation is in progress */
  readonly isJumping = signal(false);

  readonly depthProgress = computed(() => this.zoomDepth() / this.maxDepth);

  setZoomDepth(value: number): void {
    const clamped = Math.min(this.maxDepth, Math.max(this.minDepth, value));
    this.zoomDepth.set(clamped);
  }

  setActiveSegment(segmentId: string | null): void {
    this.activeSegmentId.set(segmentId);
  }

  setActiveProject(projectSlug: string | null): void {
    this.activeProjectSlug.set(projectSlug);
  }

  /**
   * Given the current zoomDepth, resolve and apply the correct active segment
   * from the provided segments list. Called on every animation frame during scroll/jump.
   */
  resolveActiveSegment(segments: TimelineSegment[]): void {
    const depth = this.zoomDepth();
    const match = segments.find(s => depth >= s.depthStart && depth <= s.depthEnd)
      ?? segments.reduce((closest, s) => {
        const dClosest = Math.min(Math.abs(closest.depthStart - depth), Math.abs(closest.depthEnd - depth));
        const dThis = Math.min(Math.abs(s.depthStart - depth), Math.abs(s.depthEnd - depth));
        return dThis < dClosest ? s : closest;
      }, segments[0]);
    if (match && match.id !== this.activeSegmentId()) {
      this.activeSegmentId.set(match.id);
    }
  }
}

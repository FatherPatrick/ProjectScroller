import { Injectable, NgZone, inject, OnDestroy } from '@angular/core';
import { InputNormalizerService } from './input-normalizer.service';
import { AppStateService } from './app-state.service';
import type { TimelineSegment } from '../models/timeline';
import { TUNNEL_CONFIG } from '../tunnel-config';

@Injectable({
  providedIn: 'root'
})
export class ZoomEngineService implements OnDestroy {
  private inputNormalizer = inject(InputNormalizerService);
  private appState = inject(AppStateService);
  private ngZone = inject(NgZone);

  private readonly MIN_DEPTH = TUNNEL_CONFIG.minDepth;
  private readonly MAX_DEPTH = TUNNEL_CONFIG.maxDepth;
  private readonly DAMPING_FACTOR = 0.975; // Slower decay for a smoother, longer ease-out
  private readonly MOMENTUM_THRESHOLD = 0.04;
  private readonly MAX_VELOCITY = 3.2;

  private currentVelocity = 0;
  private isAnimating = false;
  private rafId: number | null = null;

  /** Segments reference kept for auto-resolving active segment during animation */
  private segments: TimelineSegment[] = [];

  constructor() {
    this.initializeZoomEngine();
  }

  /** Call once segments are loaded from API so the engine can auto-resolve active segment */
  setSegments(segments: TimelineSegment[]): void {
    this.segments = segments;
  }

  private initializeZoomEngine(): void {
    this.inputNormalizer.zoomDelta$.subscribe((delta: number) => {
      this.currentVelocity += delta;
      this.currentVelocity = Math.max(-this.MAX_VELOCITY, Math.min(this.MAX_VELOCITY, this.currentVelocity));
      if (!this.isAnimating) {
        this.startMomentumLoop();
      }
    });
  }

  private startMomentumLoop(): void {
    this.isAnimating = true;
    this.ngZone.runOutsideAngular(() => {
      const animate = () => {
        if (Math.abs(this.currentVelocity) > this.MOMENTUM_THRESHOLD) {
          this.currentVelocity *= this.DAMPING_FACTOR;

          const currentDepth = this.appState.zoomDepth();
          const newDepth = currentDepth + this.currentVelocity;
          const clampedDepth = Math.max(this.MIN_DEPTH, Math.min(this.MAX_DEPTH, newDepth));

          this.ngZone.run(() => {
            this.appState.setZoomDepth(clampedDepth);
            if (this.segments.length > 0) {
              this.appState.resolveActiveSegment(this.segments);
            }
          });

          if (clampedDepth !== newDepth) {
            this.currentVelocity = -this.currentVelocity * 0.3;
          }

          this.rafId = requestAnimationFrame(animate);
        } else {
          this.currentVelocity = 0;
          this.isAnimating = false;
          this.rafId = null;
          // Final resolve when momentum stops
          this.ngZone.run(() => {
            if (this.segments.length > 0) {
              this.appState.resolveActiveSegment(this.segments);
            }
          });
        }
      };

      this.rafId = requestAnimationFrame(animate);
    });
  }

  /**
   * Jump to a specific depth with a fast mid-flight zoom profile.
   * Resolves active segment on every frame during the animation.
   */
  jumpToDepth(targetDepth: number, durationMs = 300): void {
    const clampedTarget = Math.max(this.MIN_DEPTH, Math.min(this.MAX_DEPTH, targetDepth));
    const startDepth = this.appState.zoomDepth();
    const startTime = performance.now();

    if (durationMs <= 0) {
      this.ngZone.run(() => {
        this.appState.isJumping.set(false);
        this.appState.setZoomDepth(clampedTarget);
        if (this.segments.length > 0) {
          this.appState.resolveActiveSegment(this.segments);
        }
      });
      return;
    }

    // Cancel any existing momentum
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.currentVelocity = 0;

    this.ngZone.run(() => { this.appState.isJumping.set(true); });

    this.ngZone.runOutsideAngular(() => {
      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / durationMs, 1);

        // Ease-in-out cubic: readable start/end with fast center traversal
        const easeProgress = progress < 0.5
          ? 4 * Math.pow(progress, 3)
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;
        const newDepth = startDepth + (clampedTarget - startDepth) * easeProgress;

        this.ngZone.run(() => {
          this.appState.setZoomDepth(newDepth);
          if (this.segments.length > 0) {
            this.appState.resolveActiveSegment(this.segments);
          }
        });

        if (progress < 1) {
          this.rafId = requestAnimationFrame(animate);
        } else {
          this.ngZone.run(() => {
            this.appState.setZoomDepth(clampedTarget);
            if (this.segments.length > 0) {
              this.appState.resolveActiveSegment(this.segments);
            }
            this.appState.isJumping.set(false);
          });
          this.rafId = null;
          this.isAnimating = false;
        }
      };

      this.isAnimating = true;
      this.rafId = requestAnimationFrame(animate);
    });
  }

  ngOnDestroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }
  }
}

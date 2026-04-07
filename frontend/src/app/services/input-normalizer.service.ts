import { Injectable, NgZone } from '@angular/core';
import { Subject, Observable, merge } from 'rxjs';
import { throttleTime, filter } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class InputNormalizerService {
  private wheelDelta$ = new Subject<number>();
  private touchDelta$ = new Subject<number>();
  private lastTouchDistance = 0;
  private readonly WHEEL_DELTA_SCALE = 0.0025; // Smaller per-tick depth change for slower tunnel travel
  private readonly PINCH_SCALE = 0.1; // Keep touch zoom aligned with slower wheel traversal
  private readonly THROTTLE_MS = 50; // Throttle input events to avoid overwhelming updates

  readonly zoomDelta$: Observable<number> = merge(
    this.wheelDelta$,
    this.touchDelta$
  ).pipe(
    throttleTime(this.THROTTLE_MS, undefined, { leading: true, trailing: true }),
    filter(delta => delta !== 0) // Ignore zero deltas
  );

  constructor(private ngZone: NgZone) {
    this.initializeInputListeners();
  }

  private initializeInputListeners(): void {
    // Run outside Angular zone to avoid excessive change detection
    this.ngZone.runOutsideAngular(() => {
      // Wheel event listener
      document.addEventListener('wheel', (event: WheelEvent) => {
        // Only intercept scroll over the tunnel stage; allow normal scroll outside
        const tunnelStage = document.querySelector('.tunnel-stage');
        if (tunnelStage && tunnelStage.contains(event.target as Node)) {
          event.preventDefault();
          // Normalize wheel delta: positive = scroll up (zoom in), negative = scroll down (zoom out)
          const delta = -event.deltaY * this.WHEEL_DELTA_SCALE;
          this.wheelDelta$.next(delta);
        }
      }, { passive: false });

      // Touch events for pinch zoom
      document.addEventListener('touchstart', (event: TouchEvent) => {
        if (event.touches.length === 2) {
          this.lastTouchDistance = this.calculateTouchDistance(event.touches[0], event.touches[1]);
        }
      });

      document.addEventListener('touchmove', (event: TouchEvent) => {
        if (event.touches.length === 2) {
          event.preventDefault();
          const currentDistance = this.calculateTouchDistance(event.touches[0], event.touches[1]);
          const distanceDelta = currentDistance - this.lastTouchDistance;
          const zoomDelta = distanceDelta * this.PINCH_SCALE;
          this.touchDelta$.next(zoomDelta);
          this.lastTouchDistance = currentDistance;
        }
      }, { passive: false });

      document.addEventListener('touchend', (event: TouchEvent) => {
        if (event.touches.length < 2) {
          this.lastTouchDistance = 0;
        }
      });
    });
  }

  private calculateTouchDistance(touch1: Touch, touch2: Touch): number {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }
}

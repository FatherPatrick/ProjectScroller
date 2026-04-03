import { Injectable, computed, inject } from '@angular/core';
import type { TimelineSegment } from '../models/timeline';
import { AppStateService } from './app-state.service';

export interface DepthBand {
  segment: TimelineSegment;
  depthCenter: number; // Middle of segment's depth range
  depthStart: number;
  depthEnd: number;
  distanceFromCurrent: number; // Absolute distance from current zoom depth
  isActive: boolean; // True if current depth is within this segment's range
  proximityOpacity: number; // 0-1, higher when closer to current depth
  glowIntensity: number; // 0-1, how much glow effect to apply
}

@Injectable({
  providedIn: 'root'
})
export class DepthBandResolverService {
  private appState = inject(AppStateService);

  /**
   * Resolve all depth bands for current zoom depth.
   * Returns computed signal of DepthBand[] ordered by distance from current depth.
   */
  readonly resolvedBands = computed(() => {
    // This will be wired in app component after timeline segments load
    return [] as DepthBand[];
  });

  /**
   * Calculate depth bands for a set of segments at current zoom depth
   */
  calculateBands(segments: TimelineSegment[]): DepthBand[] {
    const currentDepth = this.appState.zoomDepth();
    const MAX_DEPTH = 100;
    const PROXIMITY_FALLOFF = 30; // Glow effect falls off over 30 depth units

    return segments.map((segment) => {
      const depthStart = segment.depthStart;
      const depthEnd = segment.depthEnd;
      const depthCenter = (depthStart + depthEnd) / 2;
      const distanceFromCurrent = Math.abs(depthCenter - currentDepth);
      const isActive = currentDepth >= depthStart && currentDepth <= depthEnd;

      // Proximity opacity: 1.0 when current depth is in segment, falls off to ~0.3 at falloff distance
      const proximityOpacity = Math.max(
        0.3,
        1 - (distanceFromCurrent / PROXIMITY_FALLOFF)
      );

      // Glow intensity: peaks when segment is active, diminishes when far away
      const glowIntensity = isActive
        ? 1.0
        : Math.max(0, 1 - (distanceFromCurrent / PROXIMITY_FALLOFF) * 0.8);

      return {
        segment,
        depthCenter,
        depthStart,
        depthEnd,
        distanceFromCurrent,
        isActive,
        proximityOpacity,
        glowIntensity
      };
    });
  }

  /**
   * Get the closest segment above current depth (for far-field rendering)
   */
  getUpcomingSegment(segments: TimelineSegment[], currentDepth: number): TimelineSegment | null {
    return segments.find(seg => seg.depthStart > currentDepth) ?? null;
  }

  /**
   * Get the closest segment below current depth (for near-field rendering)
   */
  getPreviousSegment(segments: TimelineSegment[], currentDepth: number): TimelineSegment | null {
    const reversed = [...segments].reverse();
    return reversed.find(seg => seg.depthEnd < currentDepth) ?? null;
  }

  /**
   * Determine which quadrant (far/mid-far/mid-near/near) a depth falls into
   */
  getDepthQuadrant(depth: number): 'far' | 'mid-far' | 'mid-near' | 'near' {
    if (depth < 25) return 'far';
    if (depth < 50) return 'mid-far';
    if (depth < 75) return 'mid-near';
    return 'near';
  }

  /**
   * Scale factor for visual rendering based on depth quadrant
   * Segments closer to current depth appear larger/more prominent
   */
  getScaleForProximity(band: DepthBand): number {
    // Scale from 0.6 (far away) to 1.0 (at current depth)
    const baseScale = 0.6 + (1 - (band.distanceFromCurrent / 100)) * 0.4;
    return Math.max(0.6, Math.min(1.0, baseScale));
  }
}

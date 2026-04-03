import { Component, OnInit, OnDestroy, HostListener, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { Project, TimelineSegment } from './models/timeline';
import { AppStateService } from './services/app-state.service';
import { TimelineApiService } from './services/timeline-api.service';
import { ZoomEngineService } from './services/zoom-engine.service';
import { DepthBandResolverService } from './services/depth-band-resolver.service';
import { ProjectCardComponent } from './components/project-card/project-card.component';
import { ProjectDetailComponent } from './components/project-detail/project-detail.component';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
  standalone: true,
  imports: [CommonModule, ProjectCardComponent, ProjectDetailComponent]
})
export class App implements OnInit, OnDestroy {
  private readonly timelineApi = inject(TimelineApiService);
  private readonly zoomEngine = inject(ZoomEngineService);
  private readonly depthBandResolver = inject(DepthBandResolverService);
  private readonly motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly onMotionChange = (event: MediaQueryListEvent) => {
    this.prefersReducedMotion.set(event.matches);
  };

  readonly state = inject(AppStateService);
  readonly timelineSegments = signal<TimelineSegment[]>([]);
  readonly allProjects = signal<Project[]>([]);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly selectedProject = signal<Project | null>(null);
  readonly prefersReducedMotion = signal(this.motionQuery.matches);

  readonly activeSegment = computed(() => {
    const id = this.state.activeSegmentId();
    return this.timelineSegments().find(s => s.id === id) ?? null;
  });

  readonly activeProjects = computed(() => {
    const segment = this.activeSegment();
    if (!segment) return [];
    return this.allProjects().filter(p => segment.projectIds.includes(p.id));
  });

  readonly a11yStatus = computed(() => {
    const segment = this.activeSegment();
    const depth = Math.round(this.state.zoomDepth());
    if (!segment) {
      return `Depth ${depth}.`;
    }
    return `Depth ${depth}. Active segment ${segment.label}.`;
  });

  /**
   * Move each ring in Z-space toward the viewer as depth increases.
   * Perspective is on the container; these values stay well within clip plane.
   */
  readonly ringTransforms = computed(() => {
    const depth = this.state.zoomDepth();
    // Each unit of depth shifts rings 2.5px closer along Z axis.
    // Base offsets spread rings: far=-240px, mid=-120px, near=0px.
    const travel = depth * 2.5;
    return {
      far: `translateZ(${-240 + travel}px)`,
      mid: `translateZ(${-120 + travel}px)`,
      near: `translateZ(${travel}px)`,
    };
  });


  readonly depthBands = computed(() =>
    this.depthBandResolver.calculateBands(this.timelineSegments())
  );

  readonly visibleBands = computed(() => {
    const VISIBILITY_RANGE = 50;
    const currentDepth = this.state.zoomDepth();
    return this.depthBands().filter(
      b => Math.abs(b.depthCenter - currentDepth) <= VISIBILITY_RANGE
    );
  });

  readonly depthGlowIntensity = computed(() =>
    (this.state.zoomDepth() / 100) * 0.6
  );

  ngOnInit(): void {
    this.timelineApi.getTimeline().subscribe({
      next: (response) => {
        this.timelineSegments.set(response.timelineSegments);
        this.zoomEngine.setSegments(response.timelineSegments);

        // Resolve initial segment from URL hash or default to first
        const hash = window.location.hash.replace('#', '');
        const fromHash = hash
          ? response.timelineSegments.find(s => s.id === hash)
          : null;
        const initial = fromHash ?? response.timelineSegments[0];

        if (initial) {
          this.state.setActiveSegment(initial.id);
          this.state.setZoomDepth(initial.depthStart);
        }

        this.isLoading.set(false);
      },
      error: () => {
        this.loadError.set('Unable to load timeline data.');
        this.isLoading.set(false);
      }
    });

    this.timelineApi.getProjects().subscribe({
      next: (response) => this.allProjects.set(response.projects),
      error: () => console.error('Failed to load projects')
    });

    this.motionQuery.addEventListener('change', this.onMotionChange);
  }

  ngOnDestroy(): void {
    this.motionQuery.removeEventListener('change', this.onMotionChange);
  }

  jumpToSegment(segment: TimelineSegment): void {
    this.state.setActiveSegment(segment.id);
    this.selectedProject.set(null);
    this.updateUrlHash(segment.id);
    this.zoomEngine.jumpToDepth(segment.depthStart, this.prefersReducedMotion() ? 0 : 350);
  }

  openProject(project: Project): void {
    this.selectedProject.set(
      this.selectedProject()?.id === project.id ? null : project
    );
  }

  closeProject(): void {
    this.selectedProject.set(null);
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    // Ignore if focus is inside an input
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;

    const segments = this.timelineSegments();
    if (segments.length === 0) return;

    const activeId = this.state.activeSegmentId();
    const currentIndex = segments.findIndex(s => s.id === activeId);

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      const next = segments[currentIndex + 1];
      if (next) this.jumpToSegment(next);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      const prev = segments[currentIndex - 1];
      if (prev) this.jumpToSegment(prev);
    } else if (event.key === '+' || event.key === '=' || event.key === 'PageUp') {
      event.preventDefault();
      this.nudgeDepth(4);
    } else if (event.key === '-' || event.key === '_' || event.key === 'PageDown') {
      event.preventDefault();
      this.nudgeDepth(-4);
    } else if (event.key === 'Home') {
      event.preventDefault();
      const first = segments[0];
      if (first) this.jumpToSegment(first);
    } else if (event.key === 'End') {
      event.preventDefault();
      const last = segments[segments.length - 1];
      if (last) this.jumpToSegment(last);
    }
  }

  private nudgeDepth(delta: number): void {
    const current = this.state.zoomDepth();
    this.state.setZoomDepth(current + delta);
    this.state.resolveActiveSegment(this.timelineSegments());
  }

  private updateUrlHash(segmentId: string): void {
    history.replaceState(null, '', `#${segmentId}`);
  }
}

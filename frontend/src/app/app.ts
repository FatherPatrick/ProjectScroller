import { Component, OnInit, OnDestroy, HostListener, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { Project, TimelineSegment } from './models/timeline';
import { AppStateService } from './services/app-state.service';
import { TimelineApiService } from './services/timeline-api.service';
import { ZoomEngineService } from './services/zoom-engine.service';
import { ProjectCardComponent } from './components/project-card/project-card.component';
import { ProjectDetailComponent } from './components/project-detail/project-detail.component';

type TunnelSlide = {
  segment: TimelineSegment;
  projects: Project[];
  index: number;
  side: 'left' | 'right';
  isActive: boolean;
  isVisible: boolean;
  opacity: number;
  zIndex: number;
  blur: string;
  transform: string;
  progressPercent: number;
  projectPreviewTitles: string[];
};

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

  readonly activeSegmentIndex = computed(() => {
    const activeId = this.state.activeSegmentId();
    return this.timelineSegments().findIndex(segment => segment.id === activeId);
  });

  readonly ringTransforms = computed(() => {
    const depth = this.state.zoomDepth();
    const travel = depth * 2.5;
    return {
      far: `translateZ(${-260 + travel}px)`,
      mid: `translateZ(${-140 + travel}px)`,
      near: `translateZ(${-20 + travel}px)`
    };
  });

  readonly depthGlowIntensity = computed(() =>
    0.18 + (this.state.zoomDepth() / 100) * 0.62
  );

  readonly activeSegmentProgress = computed(() => {
    const segment = this.activeSegment();
    if (!segment) {
      return 0;
    }

    const span = Math.max(1, segment.depthEnd - segment.depthStart);
    const rawProgress = (this.state.zoomDepth() - segment.depthStart) / span;
    return Math.max(0, Math.min(1, rawProgress));
  });

  readonly tunnelSlides = computed<TunnelSlide[]>(() => {
    const segments = this.timelineSegments();
    const activeId = this.state.activeSegmentId();
    const currentDepth = this.state.zoomDepth();

    return segments.map((segment, index) => {
      const projects = this.allProjects().filter(project => segment.projectIds.includes(project.id));
      const depthCenter = (segment.depthStart + segment.depthEnd) / 2;
      const relativeDepth = depthCenter - currentDepth;
      const distance = Math.abs(relativeDepth);
      const normalizedDistance = Math.min(distance / 34, 1.8);
      const passedViewer = relativeDepth < -8;
      const viewerFade = passedViewer
        ? Math.max(0, 1 - (Math.abs(relativeDepth) - 8) / 18)
        : 1;
      const opacity = Math.max(0, (1 - normalizedDistance * 0.55) * viewerFade);
      const scale = 0.72 + Math.max(0, 1 - distance / 40) * 0.36;
      const blurAmount = Math.min(normalizedDistance * 3, 5.5);
      const side: 'left' | 'right' = index % 2 === 0 ? 'left' : 'right';
      const laneDirection = side === 'left' ? -1 : 1;
      const facingDirection = side === 'left' ? 1 : -1;
      const baseLaneOffset = 220;
      const laneCompression = Math.min(distance * 3.2, 140);
      const lateralOffset = laneDirection * (baseLaneOffset - laneCompression);
      const verticalOffset = Math.max(-72, Math.min(72, relativeDepth * 1.4));
      const zOffset = (currentDepth - depthCenter) * 16;
      const rotateX = Math.max(-14, Math.min(14, -relativeDepth * 0.22));
      const rotateY = facingDirection * Math.max(4, Math.min(16, 6 + distance * 0.12));
      const progressPercent = this.getSegmentProgress(segment);

      return {
        segment,
        projects,
        index,
        side,
        isActive: segment.id === activeId,
        isVisible: distance <= 44,
        opacity,
        zIndex: segment.id === activeId ? 5 : Math.max(1, 4 - index),
        blur: `blur(${blurAmount.toFixed(2)}px)`,
        transform: `translate3d(${lateralOffset.toFixed(2)}px, ${verticalOffset.toFixed(2)}px, ${zOffset.toFixed(2)}px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale(${scale.toFixed(4)})`,
        progressPercent,
        projectPreviewTitles: projects.slice(0, 3).map(project => project.title)
      };
    });
  });

  readonly a11yStatus = computed(() => {
    const segment = this.activeSegment();
    const depth = Math.round(this.state.zoomDepth());
    const slideCount = this.timelineSegments().length;
    const slideNumber = this.activeSegmentIndex() + 1;
    if (!segment) {
      return `Depth ${depth}.`;
    }
    return `Depth ${depth}. Slide ${slideNumber} of ${slideCount}. Active segment ${segment.label}.`;
  });

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

  getSegmentProgress(segment: TimelineSegment): number {
    const span = Math.max(1, segment.depthEnd - segment.depthStart);
    const rawProgress = (this.state.zoomDepth() - segment.depthStart) / span;
    const clamped = Math.max(0, Math.min(1, rawProgress));
    return Math.round(clamped * 100);
  }

  private updateUrlHash(segmentId: string): void {
    history.replaceState(null, '', `#${segmentId}`);
  }
}

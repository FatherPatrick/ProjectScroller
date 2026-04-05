import { Component, OnInit, OnDestroy, HostListener, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { Project, TimelineSegment, SubMilestone, SegmentCard } from './models/timeline';
import { AppStateService } from './services/app-state.service';
import { TimelineApiService } from './services/timeline-api.service';
import { ZoomEngineService } from './services/zoom-engine.service';
import { ProjectCardComponent } from './components/project-card/project-card.component';
import { ProjectDetailComponent } from './components/project-detail/project-detail.component';
import { ThreeTunnelComponent } from './components/three-tunnel/three-tunnel.component';

type TunnelSlide = {
  segment: TimelineSegment;
  projects: Project[];
  index: number;
  globalIndex?: number;
  side: 'left' | 'right';
  isActive: boolean;
  isVisible: boolean;
  opacity: number;
  zIndex: number;
  blur: string;
  transform: string;
  progressPercent: number;
  projectPreviewTitles: string[];
  isSubmilestone: false;
  isSegmentCard: false;
  depth: number;
};

type SegmentCardSlide = {
  segment: TimelineSegment;
  card: SegmentCard;
  projects: Project[];
  index: number;
  globalIndex?: number;
  side: 'left' | 'right';
  isVisible: boolean;
  opacity: number;
  zIndex: number;
  blur: string;
  transform: string;
  isSubmilestone: false;
  isSegmentCard: true;
  depth: number;
};

type SubmilestoneSlide = {
  segment: TimelineSegment;
  project: Project;
  submilestone: SubMilestone;
  index: number;
  globalIndex: number;
  side: 'left' | 'right';
  isVisible: boolean;
  opacity: number;
  zIndex: number;
  blur: string;
  transform: string;
  isSubmilestone: true;
  isSegmentCard: false;
  depth: number;
};

type AllSlide = TunnelSlide | SegmentCardSlide | SubmilestoneSlide;

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
  standalone: true,
  imports: [CommonModule, ProjectCardComponent, ProjectDetailComponent, ThreeTunnelComponent]
})
export class App implements OnInit, OnDestroy {
  private readonly SCENE_DEPTH_MULTIPLIER = 4;
  private readonly DEPTH_VISIBILITY_RANGE = 260;
  private readonly DEPTH_NORMALIZATION_RANGE = 220;
  private readonly DEPTH_FADE_START = 48;
  private readonly DEPTH_FADE_RANGE = 96;
  private readonly DEPTH_SCALE_RANGE = 260;
  private readonly DEPTH_LATERAL_COMPRESSION = 0.12;
  private readonly DEPTH_VERTICAL_FACTOR = 0.18;
  private readonly DEPTH_Z_FACTOR = 8.5;
  private readonly DEPTH_ROTATE_X_FACTOR = 0.018;
  private readonly DEPTH_ROTATE_Y_FACTOR = 0.012;

  private readonly timelineApi = inject(TimelineApiService);
  private readonly zoomEngine = inject(ZoomEngineService);
  private readonly motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly onMotionChange = (event: MediaQueryListEvent) => {
    this.prefersReducedMotion.set(event.matches);
  };

  readonly state = inject(AppStateService);
  readonly timelineSegments = signal<TimelineSegment[]>([]);
  readonly allProjects = signal<Project[]>([]);
  readonly allSegmentCards = signal<SegmentCard[]>([]);
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
    0.18 + (this.state.zoomDepth() / 1000) * 0.62
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

  readonly tunnelSlides = computed<AllSlide[]>(() => {
    const segments = this.timelineSegments();
    const cards = this.allSegmentCards();
    const activeId = this.state.activeSegmentId();
    const currentDepth = this.state.zoomDepth();
    const allSlides: AllSlide[] = [];
    let globalIndex = 0;

    segments.forEach((segment, segmentIndex) => {
      const projects = this.allProjects().filter(project => segment.projectIds.includes(project.id));
      const depthCenter = (segment.depthStart + segment.depthEnd) / 2;
      
      // Collect segment cards for this segment
      const segmentCards = cards.filter(card => card.segmentId === segment.id);
      
      // Add main segment slide
      const mainSlide = this.calculateMainSlide(
        segment,
        projects,
        segmentIndex,
        depthCenter,
        currentDepth,
        activeId
      );
      allSlides.push(mainSlide);
      globalIndex++;

      // Add segment card slides in depth order
      segmentCards.sort((a, b) => a.depthStart - b.depthStart);
      segmentCards.forEach((card, cardIndex) => {
        const cardCenter = (card.depthStart + card.depthEnd) / 2;
        const cardProjects = this.allProjects().filter(p => card.projectIds.includes(p.id));
        const cardSlide = this.calculateSegmentCardSlide(
          segment,
          card,
          cardProjects,
          globalIndex,
          cardCenter,
          currentDepth,
          cardIndex % 2 === 0 ? 'left' : 'right'
        );
        allSlides.push(cardSlide);
        globalIndex++;
      });

      // Add submilestone slides
      projects.forEach(project => {
        if (project.submilestones && project.submilestones.length > 0) {
          const submilestoneSpacing = (segment.depthEnd - segment.depthStart) / (project.submilestones.length + 1);
          project.submilestones.forEach((submilestone, subIndex) => {
            const submilestoneDepth = segment.depthStart + submilestoneSpacing * (subIndex + 1);
            const subSlide = this.calculateSubmilestoneSlide(
              segment,
              project,
              submilestone,
              globalIndex,
              submilestoneDepth,
              currentDepth,
              subIndex % 2 === 0 ? 'left' : 'right'
            );
            allSlides.push(subSlide);
            globalIndex++;
          });
        }
      });
    });

    return allSlides;
  });

  private calculateMainSlide(
    segment: TimelineSegment,
    projects: Project[],
    index: number,
    depthCenter: number,
    currentDepth: number,
    activeId: string | null
  ): TunnelSlide {
    const relativeDepth = depthCenter - currentDepth;
    const sceneRelativeDepth = relativeDepth * this.SCENE_DEPTH_MULTIPLIER;
    const distance = Math.abs(sceneRelativeDepth);
    const normalizedDistance = Math.min(distance / this.DEPTH_NORMALIZATION_RANGE, 1.8);
    const passedViewer = sceneRelativeDepth < -this.DEPTH_FADE_START;
    const viewerFade = passedViewer
      ? Math.max(0, 1 - (Math.abs(sceneRelativeDepth) - this.DEPTH_FADE_START) / this.DEPTH_FADE_RANGE)
      : 1;
    const opacity = Math.max(0, (1 - normalizedDistance * 0.55) * viewerFade);
    const scale = 0.72 + Math.max(0, 1 - distance / this.DEPTH_SCALE_RANGE) * 0.36;
    const blurAmount = Math.min(normalizedDistance * 3, 5.5);
    const side: 'left' | 'right' = index % 2 === 0 ? 'left' : 'right';
    const laneDirection = side === 'left' ? -1 : 1;
    const facingDirection = side === 'left' ? 1 : -1;
    const baseLaneOffset = 280;
    const laneCompression = Math.min(distance * this.DEPTH_LATERAL_COMPRESSION, 170);
    const lateralOffset = laneDirection * (baseLaneOffset - laneCompression);
    const verticalOffset = Math.max(-92, Math.min(92, sceneRelativeDepth * this.DEPTH_VERTICAL_FACTOR));
    const zOffset = -sceneRelativeDepth * this.DEPTH_Z_FACTOR;
    const rotateX = Math.max(-14, Math.min(14, -sceneRelativeDepth * this.DEPTH_ROTATE_X_FACTOR));
    const rotateY = facingDirection * Math.max(4, Math.min(18, 6 + distance * this.DEPTH_ROTATE_Y_FACTOR));
    const progressPercent = this.getSegmentProgress(segment);

    return {
      segment,
      projects,
      index,
      side,
      isActive: segment.id === activeId,
      isVisible: distance <= this.DEPTH_VISIBILITY_RANGE,
      opacity,
      zIndex: segment.id === activeId ? 5 : Math.max(1, 4 - index),
      blur: `blur(${blurAmount.toFixed(2)}px)`,
      transform: `translate3d(${lateralOffset.toFixed(2)}px, ${verticalOffset.toFixed(2)}px, ${zOffset.toFixed(2)}px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale(${scale.toFixed(4)})`,
      progressPercent,
      projectPreviewTitles: projects.slice(0, 3).map(project => project.title),
      isSubmilestone: false,
      isSegmentCard: false,
      depth: depthCenter
    };
  }

  private calculateSegmentCardSlide(
    segment: TimelineSegment,
    card: SegmentCard,
    projects: Project[],
    index: number,
    depth: number,
    currentDepth: number,
    side: 'left' | 'right'
  ): SegmentCardSlide {
    const relativeDepth = depth - currentDepth;
    const sceneRelativeDepth = relativeDepth * this.SCENE_DEPTH_MULTIPLIER;
    const distance = Math.abs(sceneRelativeDepth);
    const normalizedDistance = Math.min(distance / this.DEPTH_NORMALIZATION_RANGE, 1.8);
    const passedViewer = sceneRelativeDepth < -this.DEPTH_FADE_START;
    const viewerFade = passedViewer
      ? Math.max(0, 1 - (Math.abs(sceneRelativeDepth) - this.DEPTH_FADE_START) / this.DEPTH_FADE_RANGE)
      : 1;
    const opacity = Math.max(0, (1 - normalizedDistance * 0.55) * viewerFade) * 0.8;
    const scale = 0.6 + Math.max(0, 1 - distance / this.DEPTH_SCALE_RANGE) * 0.3;
    const blurAmount = Math.min(normalizedDistance * 3, 5.5);
    const laneDirection = side === 'left' ? -1 : 1;
    const facingDirection = side === 'left' ? 1 : -1;
    const baseLaneOffset = 220;
    const laneCompression = Math.min(distance * this.DEPTH_LATERAL_COMPRESSION, 130);
    const lateralOffset = laneDirection * (baseLaneOffset - laneCompression);
    const verticalOffset = Math.max(-92, Math.min(92, sceneRelativeDepth * this.DEPTH_VERTICAL_FACTOR));
    const zOffset = -sceneRelativeDepth * this.DEPTH_Z_FACTOR;
    const rotateX = Math.max(-14, Math.min(14, -sceneRelativeDepth * this.DEPTH_ROTATE_X_FACTOR));
    const rotateY = facingDirection * Math.max(4, Math.min(18, 6 + distance * this.DEPTH_ROTATE_Y_FACTOR));

    return {
      segment,
      card,
      projects,
      index,
      side,
      isVisible: distance <= this.DEPTH_VISIBILITY_RANGE,
      opacity,
      zIndex: Math.max(0, 3 - Math.floor(distance / 80)),
      blur: `blur(${blurAmount.toFixed(2)}px)`,
      transform: `translate3d(${lateralOffset.toFixed(2)}px, ${verticalOffset.toFixed(2)}px, ${zOffset.toFixed(2)}px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale(${scale.toFixed(4)})`,
      isSubmilestone: false,
      isSegmentCard: true,
      depth
    };
  }

  private calculateSubmilestoneSlide(
    segment: TimelineSegment,
    project: Project,
    submilestone: SubMilestone,
    globalIndex: number,
    depth: number,
    currentDepth: number,
    side: 'left' | 'right'
  ): SubmilestoneSlide {
    const relativeDepth = depth - currentDepth;
    const sceneRelativeDepth = relativeDepth * this.SCENE_DEPTH_MULTIPLIER;
    const distance = Math.abs(sceneRelativeDepth);
    const normalizedDistance = Math.min(distance / this.DEPTH_NORMALIZATION_RANGE, 1.8);
    const passedViewer = sceneRelativeDepth < -this.DEPTH_FADE_START;
    const viewerFade = passedViewer
      ? Math.max(0, 1 - (Math.abs(sceneRelativeDepth) - this.DEPTH_FADE_START) / this.DEPTH_FADE_RANGE)
      : 1;
    const opacity = Math.max(0, (1 - normalizedDistance * 0.55) * viewerFade) * 0.7;
    const scale = 0.5 + Math.max(0, 1 - distance / this.DEPTH_SCALE_RANGE) * 0.25;
    const blurAmount = Math.min(normalizedDistance * 3, 5.5);
    const laneDirection = side === 'left' ? -1 : 1;
    const facingDirection = side === 'left' ? 1 : -1;
    const baseLaneOffset = 160;
    const laneCompression = Math.min(distance * this.DEPTH_LATERAL_COMPRESSION, 100);
    const lateralOffset = laneDirection * (baseLaneOffset - laneCompression);
    const verticalOffset = Math.max(-92, Math.min(92, sceneRelativeDepth * this.DEPTH_VERTICAL_FACTOR));
    const zOffset = -sceneRelativeDepth * this.DEPTH_Z_FACTOR;
    const rotateX = Math.max(-14, Math.min(14, -sceneRelativeDepth * this.DEPTH_ROTATE_X_FACTOR));
    const rotateY = facingDirection * Math.max(4, Math.min(18, 6 + distance * this.DEPTH_ROTATE_Y_FACTOR));

    return {
      segment,
      project,
      submilestone,
      index: globalIndex,
      globalIndex,
      side,
      isVisible: distance <= this.DEPTH_VISIBILITY_RANGE,
      opacity,
      zIndex: Math.max(0, 3 - Math.floor(distance / 80)),
      blur: `blur(${blurAmount.toFixed(2)}px)`,
      transform: `translate3d(${lateralOffset.toFixed(2)}px, ${verticalOffset.toFixed(2)}px, ${zOffset.toFixed(2)}px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale(${scale.toFixed(4)})`,
      isSubmilestone: true,
      isSegmentCard: false,
      depth
    };
  }

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
        this.allSegmentCards.set(response.segmentCards || []);
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
    this.selectedProject.set(null);
    this.updateUrlHash(segment.id);
    const jumpDuration = this.getManualJumpDuration(this.state.zoomDepth(), segment.depthStart);
    this.zoomEngine.jumpToDepth(segment.depthStart, jumpDuration);
  }

  private getManualJumpDuration(currentDepth: number, targetDepth: number): number {
    const distance = Math.abs(targetDepth - currentDepth);
    const baseMs = 420;
    const distanceMs = distance * 1.05;
    const motionFactor = this.prefersReducedMotion() ? 0.8 : 1;
    return Math.round(Math.max(420, Math.min(1800, (baseMs + distanceMs) * motionFactor)));
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

import { Component, OnInit, OnDestroy, HostListener, ViewChild, ElementRef, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
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
  isSegmentChoice: false;
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
  isSegmentChoice: false;
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
  isSegmentChoice: false;
  depth: number;
};

type SegmentChoiceSlide = {
  segment: TimelineSegment;
  index: number;
  globalIndex: number;
  isVisible: boolean;
  opacity: number;
  zIndex: number;
  blur: string;
  transform: string;
  isSubmilestone: false;
  isSegmentCard: false;
  isSegmentChoice: true;
  depth: number;
};

type AllSlide = TunnelSlide | SegmentCardSlide | SubmilestoneSlide | SegmentChoiceSlide;

type ActiveProjectGroup = {
  id: string;
  label: string;
  title: string;
  projects: Project[];
};

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
  private readonly sanitizer = inject(DomSanitizer);
  private readonly motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly resumeDocPath = '/PatrickParkResume2026.docx';
  private readonly onMotionChange = (event: MediaQueryListEvent) => {
    this.prefersReducedMotion.set(event.matches);
  };

  @ViewChild('projectsPanel')
  private projectsPanelRef?: ElementRef<HTMLElement>;

  @ViewChild('projectCardsScroller')
  private projectCardsScrollerRef?: ElementRef<HTMLElement>;

  readonly state = inject(AppStateService);
  readonly timelineSegments = signal<TimelineSegment[]>([]);
  readonly allProjects = signal<Project[]>([]);
  readonly allSegmentCards = signal<SegmentCard[]>([]);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly selectedProject = signal<Project | null>(null);
  readonly lightboxUrl = signal<string | null>(null);
  readonly lightboxAlt = signal<string>('');
  readonly prefersReducedMotion = signal(this.motionQuery.matches);
  readonly resumeDownloadUrl = this.resumeDocPath;
  readonly resumeModalOpen = signal(false);
  readonly resumeLoading = signal(false);
  readonly resumeLoadError = signal<string | null>(null);
  readonly resumeHtml = signal<SafeHtml | null>(null);

  readonly activeSegment = computed(() => {
    const id = this.state.activeSegmentId();
    return this.timelineSegments().find(s => s.id === id) ?? null;
  });

  readonly activeProjects = computed(() => {
    const segment = this.activeSegment();
    if (!segment) return [];
    const segmentCardProjectIds = this.allSegmentCards()
      .filter(card => card.segmentId === segment.id)
      .flatMap(card => card.projectIds ?? []);
    const relatedIds = new Set<string>([...segment.projectIds, ...segmentCardProjectIds]);
    return this.allProjects().filter(project => relatedIds.has(project.id));
  });

  readonly activeProjectGroups = computed<ActiveProjectGroup[]>(() => {
    const segment = this.activeSegment();
    if (!segment) return [];

    const projectsById = new Map(this.allProjects().map(project => [project.id, project]));
    const groups: ActiveProjectGroup[] = [];
    const usedProjectIds = new Set<string>();

    const segmentCards = this.allSegmentCards()
      .filter(card => card.segmentId === segment.id)
      .sort((left, right) => left.depthStart - right.depthStart);

    segmentCards.forEach(card => {
      const projects = card.projectIds
        .map(projectId => projectsById.get(projectId))
        .filter((project): project is Project => !!project);

      projects.forEach(project => usedProjectIds.add(project.id));

      if (projects.length === 0) {
        return;
      }

      groups.push({
        id: card.id,
        label: this.getSegmentCardCompanyLabel(card.title),
        title: card.title,
        projects
      });
    });

    const ungroupedProjects = this.activeProjects().filter(project => !usedProjectIds.has(project.id));
    if (ungroupedProjects.length > 0) {
      groups.push({
        id: `${segment.id}-other-projects`,
        label: segment.label,
        title: `${segment.label} Projects`,
        projects: ungroupedProjects
      });
    }

    return groups;
  });

  readonly activeSegmentIndex = computed(() => {
    const activeId = this.state.activeSegmentId();
    return this.timelineSegments().findIndex(segment => segment.id === activeId);
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

  readonly stageContentYear = computed<string>(() => {
    const currentYear = new Date().getFullYear();
    const currentDepth = this.state.zoomDepth();
    const projectsById = new Map(this.allProjects().map(project => [project.id, project]));

    const cardMilestones = this.allSegmentCards()
      .map(card => {
        const startYears = card.projectIds
          .map(projectId => projectsById.get(projectId))
          .filter((project): project is Project => !!project)
          .map(project => Number.parseInt(project.startDate.slice(0, 4), 10))
          .filter(year => Number.isFinite(year));

        if (startYears.length === 0) {
          return null;
        }

        return {
          depthStart: card.depthStart,
          year: Math.min(...startYears)
        };
      })
      .filter((milestone): milestone is { depthStart: number; year: number } => milestone !== null)
      .sort((left, right) => left.depthStart - right.depthStart);

    if (cardMilestones.length === 0) {
      return String(currentYear);
    }

    const anchors = [{ depthStart: 0, year: currentYear }, ...cardMilestones];
    const clampedDepth = Math.max(0, currentDepth);

    for (let i = 0; i < anchors.length - 1; i++) {
      const from = anchors[i];
      const to = anchors[i + 1];
      if (clampedDepth <= to.depthStart) {
        const span = Math.max(1, to.depthStart - from.depthStart);
        const progress = Math.max(0, Math.min(1, (clampedDepth - from.depthStart) / span));
        const interpolatedYear = from.year + (to.year - from.year) * progress;
        return String(Math.round(interpolatedYear));
      }
    }

    return String(anchors[anchors.length - 1].year);
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
      const mainDepth = segment.depthStart;
      
      // Collect segment cards for this segment
      const segmentCards = cards.filter(card => card.segmentId === segment.id);
      
      // Add main segment slide
      const mainSlide = this.calculateMainSlide(
        segment,
        projects,
        segmentIndex,
        mainDepth,
        currentDepth,
        activeId
      );
      allSlides.push(mainSlide);
      globalIndex++;

      // Add centered choice card just before the segment's main slide
      const choiceDepth = Math.max(0, segment.depthStart - 25);
      const choiceSlide = this.calculateChoiceSlide(segment, globalIndex, choiceDepth, currentDepth);
      allSlides.push(choiceSlide);
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
    const blurAmount = Math.min(Math.max(0, (normalizedDistance - 0.7) * 2.5), 4);
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
      isSegmentChoice: false,
      depth: depthCenter
    };
  }

  private getSegmentCardCompanyLabel(title: string): string {
    const atIndex = title.lastIndexOf(' at ');
    if (atIndex >= 0) {
      return title.slice(atIndex + 4).trim();
    }

    const separatorIndex = title.indexOf(' - ');
    if (separatorIndex >= 0) {
      return title.slice(0, separatorIndex).trim();
    }

    return title.trim();
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
    const blurAmount = Math.min(Math.max(0, (normalizedDistance - 0.7) * 2.5), 4);
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
      isSegmentChoice: false,
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
    const blurAmount = Math.min(Math.max(0, (normalizedDistance - 0.7) * 2.5), 4);
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
      isSegmentChoice: false,
      depth
    };
  }

  private calculateChoiceSlide(
    segment: TimelineSegment,
    index: number,
    depth: number,
    currentDepth: number
  ): SegmentChoiceSlide {
    const relativeDepth = depth - currentDepth;
    const sceneRelativeDepth = relativeDepth * this.SCENE_DEPTH_MULTIPLIER;
    const distance = Math.abs(sceneRelativeDepth);
    const normalizedDistance = Math.min(distance / this.DEPTH_NORMALIZATION_RANGE, 1.8);
    const passedViewer = sceneRelativeDepth < -this.DEPTH_FADE_START;
    const viewerFade = passedViewer
      ? Math.max(0, 1 - (Math.abs(sceneRelativeDepth) - this.DEPTH_FADE_START) / this.DEPTH_FADE_RANGE)
      : 1;
    const opacity = Math.max(0, (1 - normalizedDistance * 0.55) * viewerFade);
    const scale = 0.72 + Math.max(0, 1 - distance / this.DEPTH_SCALE_RANGE) * 0.36;
    const blurAmount = Math.min(Math.max(0, (normalizedDistance - 0.7) * 2.5), 4);
    const verticalOffset = Math.max(-92, Math.min(92, sceneRelativeDepth * this.DEPTH_VERTICAL_FACTOR));
    const zOffset = -sceneRelativeDepth * this.DEPTH_Z_FACTOR;
    const rotateX = Math.max(-14, Math.min(14, -sceneRelativeDepth * this.DEPTH_ROTATE_X_FACTOR));

    return {
      segment,
      index,
      globalIndex: index,
      isVisible: distance <= this.DEPTH_VISIBILITY_RANGE,
      opacity,
      zIndex: 6,
      blur: `blur(${blurAmount.toFixed(2)}px)`,
      transform: `translate3d(0, ${verticalOffset.toFixed(2)}px, ${zOffset.toFixed(2)}px) rotateX(${rotateX.toFixed(2)}deg) scale(${scale.toFixed(4)})`,
      isSubmilestone: false,
      isSegmentCard: false,
      isSegmentChoice: true,
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
          this.state.setZoomDepth(fromHash ? initial.depthStart : 0);
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
    const targetDepth = Math.max(0, segment.depthStart - 25);
    const jumpDuration = this.getManualJumpDuration(this.state.zoomDepth(), targetDepth);
    this.zoomEngine.jumpToDepth(targetDepth, jumpDuration);
  }

  private getManualJumpDuration(currentDepth: number, targetDepth: number): number {
    const distance = Math.abs(targetDepth - currentDepth);
    const baseMs = 950;
    const distanceMs = distance * 2.4;
    const motionFactor = this.prefersReducedMotion() ? 0.85 : 1;
    return Math.round(Math.max(1000, Math.min(4200, (baseMs + distanceMs) * motionFactor)));
  }

  openProject(project: Project): void {
    const scroller = this.projectCardsScrollerRef?.nativeElement;
    const scrollTop = scroller?.scrollTop ?? 0;

    this.selectedProject.set(
      this.selectedProject()?.id === project.id ? null : project
    );

    requestAnimationFrame(() => {
      if (scroller) {
        scroller.scrollTop = scrollTop;
      }
    });
  }

  closeProject(): void {
    this.selectedProject.set(null);
  }

  openLightbox(event: { url: string; alt: string }): void {
    this.lightboxUrl.set(event.url);
    this.lightboxAlt.set(event.alt);
  }

  closeLightbox(): void {
    this.lightboxUrl.set(null);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.lightboxUrl()) { this.closeLightbox(); return; }
    if (this.resumeModalOpen()) { this.closeResumeViewer(); }
  }

  async openResumeViewer(): Promise<void> {
    this.resumeModalOpen.set(true);

    if (this.resumeHtml() || this.resumeLoading()) {
      return;
    }

    this.resumeLoading.set(true);
    this.resumeLoadError.set(null);

    try {
      const mammoth = await import('mammoth/mammoth.browser');
      const response = await fetch(this.resumeDocPath, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Unable to load resume: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer });
      this.resumeHtml.set(this.sanitizer.bypassSecurityTrustHtml(result.value));
    } catch {
      this.resumeLoadError.set('Unable to render resume preview. Use Download Resume to open the file directly.');
    } finally {
      this.resumeLoading.set(false);
    }
  }

  closeResumeViewer(): void {
    this.resumeModalOpen.set(false);
  }

  onLearnMoreCardClick(): void {
    const firstProject = this.activeProjects()[0];
    if (firstProject) {
      this.selectedProject.set(firstProject);
    }

    this.scrollToProjectsPanel();
  }

  onTunnelSlideClick(slide: AllSlide): void {
    this.state.setActiveSegment(slide.segment.id);

    const targetProject = this.resolveSlideProject(slide);
    if (targetProject) {
      this.selectedProject.set(targetProject);
    }

    this.scrollToProjectsPanel();
  }

  hasNextSegment(slide: AllSlide): boolean {
    const segments = this.timelineSegments();
    const currentIndex = segments.findIndex(s => s.id === slide.segment.id);
    return currentIndex >= 0 && currentIndex < segments.length - 1;
  }

  jumpToNextSegmentFromCard(event: Event, slide: AllSlide): void {
    event.stopPropagation();
    const segments = this.timelineSegments();
    const currentIndex = segments.findIndex(s => s.id === slide.segment.id);
    const next = segments[currentIndex + 1];
    if (next) {
      this.jumpToSegment(next);
    }
  }

  scrollToProjectsFromCard(event: Event, slide: AllSlide): void {
    event.stopPropagation();
    this.state.setActiveSegment(slide.segment.id);
    this.scrollToProjectsPanel();
  }

  private resolveSlideProject(slide: AllSlide): Project | null {
    if (slide.isSubmilestone) {
      return slide.project;
    }

    if (slide.isSegmentCard && slide.projects.length > 0) {
      return slide.projects[0];
    }

    if (!slide.isSegmentCard && !slide.isSubmilestone && !slide.isSegmentChoice && slide.projects.length > 0) {
      return slide.projects[0];
    }

    const activeList = this.activeProjects();
    return activeList.length > 0 ? activeList[0] : null;
  }

  getTechStackForSegmentCard(projects: Project[]): string[] {
    const techSet = new Set<string>();
    projects.forEach(project => {
      project.technologies.forEach(tech => techSet.add(tech));
    });
    return Array.from(techSet).sort();
  }

  private scrollToProjectsPanel(): void {
    const element = this.projectsPanelRef?.nativeElement;
    if (!element) {
      return;
    }

    const behavior: ScrollBehavior = this.prefersReducedMotion() ? 'auto' : 'smooth';
    element.scrollIntoView({ behavior, block: 'start' });
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

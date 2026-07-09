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
import { TUNNEL_CONFIG } from './tunnel-config';

interface SlideGeometryOptions {
  side: 'left' | 'right' | 'center';
  baseLaneOffset: number;
  laneCompressionCap: number;
  scaleBase: number;
  scaleSpan: number;
  opacityFactor: number;
}

interface SlideGeometry {
  distance: number;
  isVisible: boolean;
  opacity: number;
  blur: string;
  transform: string;
}

interface TunnelSlide {
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
}

interface SegmentCardSlide {
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
}

interface SubmilestoneSlide {
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
}

interface SegmentChoiceSlide {
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
}

type AllSlide = TunnelSlide | SegmentCardSlide | SubmilestoneSlide | SegmentChoiceSlide;

interface ActiveProjectGroup {
  id: string;
  label: string;
  title: string;
  projects: Project[];
}

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
  standalone: true,
  imports: [CommonModule, ProjectCardComponent, ProjectDetailComponent, ThreeTunnelComponent]
})
export class App implements OnInit, OnDestroy {
  private readonly timelineApi = inject(TimelineApiService);
  private readonly zoomEngine = inject(ZoomEngineService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly resumeDocPath = '/PatrickParkResume.docx';
  private readonly onMotionChange = (event: MediaQueryListEvent) => {
    this.prefersReducedMotion.set(event.matches);
  };

  @ViewChild('projectsPanel')
  private set projectsPanelSetter(ref: ElementRef<HTMLElement> | undefined) {
    this.projectsPanelRef = ref;
    this.panelObserver?.disconnect();

    if (!ref || this.projectsPanelRevealed()) {
      return;
    }

    this.panelObserver = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          this.projectsPanelRevealed.set(true);
          this.panelObserver?.disconnect();
        }
      },
      { threshold: 0.12 }
    );
    this.panelObserver.observe(ref.nativeElement);
  }

  private projectsPanelRef?: ElementRef<HTMLElement>;
  private panelObserver?: IntersectionObserver;
  private scrollAnimationFrame: number | null = null;
  private arriveTimeout: ReturnType<typeof setTimeout> | undefined;
  readonly projectsPanelRevealed = signal(false);
  readonly projectsPanelArriving = signal(false);

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
  readonly aboutMeModalOpen = signal(false);
  readonly stageCardCollapsed = signal(false);
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

  readonly storyBeats = computed<number[]>(() => {
    const beats = new Set<number>();
    this.timelineSegments().forEach(segment => beats.add(segment.depthStart));
    this.allSegmentCards().forEach(card => beats.add((card.depthStart + card.depthEnd) / 2));
    return Array.from(beats).sort((a, b) => a - b);
  });

  readonly hasPrevBeat = computed(() =>
    this.storyBeats().some(beat => beat < this.state.zoomDepth() - 2)
  );

  readonly hasNextBeat = computed(() =>
    this.storyBeats().some(beat => beat > this.state.zoomDepth() + 2)
  );

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
      const choiceDepth = Math.max(0, segment.depthStart - TUNNEL_CONFIG.choiceCardLeadIn);
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

  /**
   * Shared depth→3D-transform math for every slide variant. Converts a slide's
   * depth (relative to the viewer's current depth) into opacity, scale, blur,
   * and a CSS transform, parameterized by the variant's lane and sizing.
   */
  private computeSlideGeometry(
    depth: number,
    currentDepth: number,
    options: SlideGeometryOptions
  ): SlideGeometry {
    const sceneRelativeDepth = (depth - currentDepth) * TUNNEL_CONFIG.sceneDepthMultiplier;
    const distance = Math.abs(sceneRelativeDepth);
    const normalizedDistance = Math.min(distance / TUNNEL_CONFIG.normalizationRange, 1.8);
    const passedViewer = sceneRelativeDepth < -TUNNEL_CONFIG.fadeStart;
    const viewerFade = passedViewer
      ? Math.max(0, 1 - (distance - TUNNEL_CONFIG.fadeStart) / TUNNEL_CONFIG.fadeRange)
      : 1;
    const opacity = Math.max(0, (1 - normalizedDistance * 0.55) * viewerFade) * options.opacityFactor;
    const scale = options.scaleBase + Math.max(0, 1 - distance / TUNNEL_CONFIG.scaleRange) * options.scaleSpan;
    const blurAmount = Math.min(Math.max(0, (normalizedDistance - 0.7) * 2.5), 4);
    const verticalOffset = Math.max(-92, Math.min(92, sceneRelativeDepth * TUNNEL_CONFIG.verticalFactor));
    const zOffset = -sceneRelativeDepth * TUNNEL_CONFIG.zFactor;
    const rotateX = Math.max(-14, Math.min(14, -sceneRelativeDepth * TUNNEL_CONFIG.rotateXFactor));

    let rotateYPart = '';
    let lateralOffset = 0;
    if (options.side !== 'center') {
      const laneDirection = options.side === 'left' ? -1 : 1;
      const facingDirection = options.side === 'left' ? 1 : -1;
      const laneCompression = Math.min(distance * TUNNEL_CONFIG.lateralCompression, options.laneCompressionCap);
      lateralOffset = laneDirection * (options.baseLaneOffset - laneCompression);
      const rotateY = facingDirection * Math.max(4, Math.min(18, 6 + distance * TUNNEL_CONFIG.rotateYFactor));
      rotateYPart = ` rotateY(${rotateY.toFixed(2)}deg)`;
    }

    return {
      distance,
      isVisible: distance <= TUNNEL_CONFIG.visibilityRange,
      opacity,
      blur: `blur(${blurAmount.toFixed(2)}px)`,
      transform: `translate3d(${lateralOffset.toFixed(2)}px, ${verticalOffset.toFixed(2)}px, ${zOffset.toFixed(2)}px) rotateX(${rotateX.toFixed(2)}deg)${rotateYPart} scale(${scale.toFixed(4)})`
    };
  }

  private calculateMainSlide(
    segment: TimelineSegment,
    projects: Project[],
    index: number,
    depthCenter: number,
    currentDepth: number,
    activeId: string | null
  ): TunnelSlide {
    const side: 'left' | 'right' = index % 2 === 0 ? 'left' : 'right';
    const geometry = this.computeSlideGeometry(depthCenter, currentDepth, {
      side,
      baseLaneOffset: 280,
      laneCompressionCap: 170,
      scaleBase: 0.72,
      scaleSpan: 0.36,
      opacityFactor: 1
    });

    return {
      segment,
      projects,
      index,
      side,
      isActive: segment.id === activeId,
      isVisible: geometry.isVisible,
      opacity: geometry.opacity,
      zIndex: segment.id === activeId ? 5 : Math.max(1, 4 - index),
      blur: geometry.blur,
      transform: geometry.transform,
      progressPercent: this.getSegmentProgress(segment),
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
    const geometry = this.computeSlideGeometry(depth, currentDepth, {
      side,
      baseLaneOffset: 220,
      laneCompressionCap: 130,
      scaleBase: 0.6,
      scaleSpan: 0.3,
      opacityFactor: 0.8
    });

    return {
      segment,
      card,
      projects,
      index,
      side,
      isVisible: geometry.isVisible,
      opacity: geometry.opacity,
      zIndex: Math.max(0, 3 - Math.floor(geometry.distance / 80)),
      blur: geometry.blur,
      transform: geometry.transform,
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
    const geometry = this.computeSlideGeometry(depth, currentDepth, {
      side,
      baseLaneOffset: 160,
      laneCompressionCap: 100,
      scaleBase: 0.5,
      scaleSpan: 0.25,
      opacityFactor: 0.7
    });

    return {
      segment,
      project,
      submilestone,
      index: globalIndex,
      globalIndex,
      side,
      isVisible: geometry.isVisible,
      opacity: geometry.opacity,
      zIndex: Math.max(0, 3 - Math.floor(geometry.distance / 80)),
      blur: geometry.blur,
      transform: geometry.transform,
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
    const geometry = this.computeSlideGeometry(depth, currentDepth, {
      side: 'center',
      baseLaneOffset: 0,
      laneCompressionCap: 0,
      scaleBase: 0.72,
      scaleSpan: 0.36,
      opacityFactor: 1
    });

    return {
      segment,
      index,
      globalIndex: index,
      isVisible: geometry.isVisible,
      opacity: geometry.opacity,
      zIndex: 6,
      blur: geometry.blur,
      transform: geometry.transform,
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
    this.loadTimeline();

    this.timelineApi.getProjects().subscribe({
      next: (response) => this.allProjects.set(response.projects),
      error: () => console.error('Failed to load projects')
    });

    this.motionQuery.addEventListener('change', this.onMotionChange);
  }

  loadTimeline(): void {
    this.isLoading.set(true);
    this.loadError.set(null);

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
  }

  ngOnDestroy(): void {
    this.motionQuery.removeEventListener('change', this.onMotionChange);
    this.panelObserver?.disconnect();
    this.cancelScrollAnimation();
    if (this.arriveTimeout !== undefined) {
      clearTimeout(this.arriveTimeout);
    }
  }

  stepBeat(direction: 1 | -1): void {
    const depth = this.state.zoomDepth();
    const beats = this.storyBeats();
    const target = direction === 1
      ? beats.find(beat => beat > depth + 2)
      : [...beats].reverse().find(beat => beat < depth - 2);

    if (target === undefined) {
      return;
    }

    const duration = this.getManualJumpDuration(depth, target);
    this.zoomEngine.jumpToDepth(target, duration);
  }

  onViewDetailsClick(): void {
    this.scrollToProjectsPanel();
  }

  scrollToTunnelTop(): void {
    if (this.prefersReducedMotion()) {
      window.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }

    this.animateScrollTo(() => 0, 900);
  }

  // Eased page scroll that re-resolves its target every frame, so it stays
  // accurate while the projects panel re-lays out (e.g. detail split opening).
  private animateScrollTo(getTargetTop: () => number, duration: number): void {
    this.cancelScrollAnimation();

    const startY = window.scrollY;
    const startTime = performance.now();
    const easeInOutCubic = (t: number) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = easeInOutCubic(t);
      window.scrollTo(0, startY + (getTargetTop() - startY) * eased);

      if (t < 1) {
        this.scrollAnimationFrame = requestAnimationFrame(step);
      } else {
        this.scrollAnimationFrame = null;
      }
    };

    this.scrollAnimationFrame = requestAnimationFrame(step);
  }

  private cancelScrollAnimation(): void {
    if (this.scrollAnimationFrame !== null) {
      cancelAnimationFrame(this.scrollAnimationFrame);
      this.scrollAnimationFrame = null;
    }
  }

  jumpToSegment(segment: TimelineSegment): void {
    this.selectedProject.set(null);
    this.updateUrlHash(segment.id);
    const targetDepth = Math.max(0, segment.depthStart - TUNNEL_CONFIG.choiceCardLeadIn);
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
    if (this.aboutMeModalOpen()) { this.closeAboutMeModal(); return; }
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

  closeAboutMeModal(): void {
    this.aboutMeModalOpen.set(false);
  }

  toggleStageCard(): void {
    this.stageCardCollapsed.update(v => !v);
  }

  onLearnMoreCardClick(): void {
    this.aboutMeModalOpen.set(true);
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

    this.projectsPanelRevealed.set(true);

    if (this.prefersReducedMotion()) {
      element.scrollIntoView({ behavior: 'auto', block: 'start' });
      return;
    }

    this.triggerPanelArrive();
    this.animateScrollTo(
      () => window.scrollY + element.getBoundingClientRect().top - 12,
      950
    );
  }

  // Replays the panel's slide-up entrance on every intentional navigation,
  // not just the first time it scrolls into view.
  private triggerPanelArrive(): void {
    if (this.arriveTimeout !== undefined) {
      clearTimeout(this.arriveTimeout);
    }

    this.projectsPanelArriving.set(false);
    requestAnimationFrame(() => {
      this.projectsPanelArriving.set(true);
      this.arriveTimeout = setTimeout(() => this.projectsPanelArriving.set(false), 1600);
    });
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    // Ignore if focus is inside an input
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;

    const segments = this.timelineSegments();
    if (segments.length === 0) return;

    const activeId = this.state.activeSegmentId();
    const currentIndex = segments.findIndex(s => s.id === activeId);

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      const next = segments[currentIndex + 1];
      if (next) this.jumpToSegment(next);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      const prev = segments[currentIndex - 1];
      if (prev) this.jumpToSegment(prev);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.stepBeat(1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.stepBeat(-1);
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

export interface TimelineSegment {
  id: string;
  label: string;
  subDescription?: string;
  depthStart: number;
  depthEnd: number;
  projectIds: string[];
  segmentCardIds?: string[];
}

export interface SegmentCard {
  id: string;
  segmentId: string;
  title: string;
  description: string;
  depthStart: number;
  depthEnd: number;
  projectIds: string[];
}

export interface ProjectMedia {
  type: 'image' | 'video';
  url: string;
  alt?: string;
}

export interface ProjectLink {
  label: string;
  url: string;
}

export interface SubMilestone {
  id: string;
  title: string;
  description: string;
  date: string;
}

export interface Project {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  longDescription: string;
  startDate: string;
  endDate?: string;
  technologies: string[];
  tags: string[];
  media?: ProjectMedia[];
  links?: ProjectLink[];
  timelineWeight: number;
  submilestones?: SubMilestone[];
}

export interface TimelineResponse {
  timelineSegments: TimelineSegment[];
  segmentCards?: SegmentCard[];
}

export interface ProjectsResponse {
  projects: Project[];
}

export interface ProjectResponse {
  project: Project;
}

export type TimelineSegment = {
  id: string;
  label: string;
  depthStart: number;
  depthEnd: number;
  projectIds: string[];
  segmentCardIds?: string[];
};

export type SegmentCard = {
  id: string;
  segmentId: string;
  title: string;
  description: string;
  depthStart: number;
  depthEnd: number;
  projectIds: string[];
};

export type ProjectMedia = {
  type: 'image' | 'video';
  url: string;
  alt?: string;
};

export type ProjectLink = {
  label: string;
  url: string;
};

export type SubMilestone = {
  id: string;
  title: string;
  description: string;
  date: string;
};

export type Project = {
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
};

export type TimelineResponse = {
  timelineSegments: TimelineSegment[];
  segmentCards?: SegmentCard[];
};

export type ProjectsResponse = {
  projects: Project[];
};

export type ProjectResponse = {
  project: Project;
};

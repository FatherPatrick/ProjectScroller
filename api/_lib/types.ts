export type ProjectMedia = {
  type: 'image' | 'video';
  url: string;
  alt?: string;
};

export type ProjectLink = {
  label: string;
  url: string;
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
  media: ProjectMedia[];
  links: ProjectLink[];
  timelineWeight: number;
};

export type TimelineSegment = {
  id: string;
  label: string;
  depthStart: number;
  depthEnd: number;
  projectIds: string[];
};

export type SeedData = {
  timelineSegments: TimelineSegment[];
  projects: Project[];
};

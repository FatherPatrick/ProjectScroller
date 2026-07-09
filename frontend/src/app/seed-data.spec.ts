import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Guards db/seed-data.json against silent data typos as new roles/projects
// are added: broken references, out-of-range or overlapping depth windows.

interface SeedSegment {
  id: string;
  depthStart: number;
  depthEnd: number;
  projectIds: string[];
  segmentCardIds: string[];
}

interface SeedCard {
  id: string;
  segmentId: string;
  depthStart: number;
  depthEnd: number;
  projectIds: string[];
}

interface SeedProject {
  id: string;
  startDate: string;
}

interface SeedData {
  timelineSegments: SeedSegment[];
  segmentCards: SeedCard[];
  projects: SeedProject[];
}

const seedPath = resolve(process.cwd(), '../db/seed-data.json');
const seed: SeedData = JSON.parse(readFileSync(seedPath, 'utf-8'));

describe('seed-data.json', () => {
  const segmentIds = new Set(seed.timelineSegments.map(segment => segment.id));
  const cardIds = new Set(seed.segmentCards.map(card => card.id));
  const projectIds = new Set(seed.projects.map(project => project.id));

  it('has segments, cards, and projects', () => {
    expect(seed.timelineSegments.length).toBeGreaterThan(0);
    expect(seed.segmentCards.length).toBeGreaterThan(0);
    expect(seed.projects.length).toBeGreaterThan(0);
  });

  it('every card references an existing segment', () => {
    for (const card of seed.segmentCards) {
      expect(segmentIds.has(card.segmentId), `card ${card.id} → missing segment ${card.segmentId}`).toBe(true);
    }
  });

  it('every segmentCardId on a segment exists', () => {
    for (const segment of seed.timelineSegments) {
      for (const cardId of segment.segmentCardIds) {
        expect(cardIds.has(cardId), `segment ${segment.id} → missing card ${cardId}`).toBe(true);
      }
    }
  });

  it('every referenced projectId exists', () => {
    const referenced = [
      ...seed.timelineSegments.flatMap(segment => segment.projectIds.map(id => ({ owner: segment.id, id }))),
      ...seed.segmentCards.flatMap(card => card.projectIds.map(id => ({ owner: card.id, id })))
    ];
    for (const ref of referenced) {
      expect(projectIds.has(ref.id), `${ref.owner} → missing project ${ref.id}`).toBe(true);
    }
  });

  it('has no orphaned projects (every project is reachable from a segment or card)', () => {
    const reachable = new Set([
      ...seed.timelineSegments.flatMap(segment => segment.projectIds),
      ...seed.segmentCards.flatMap(card => card.projectIds)
    ]);
    for (const project of seed.projects) {
      expect(reachable.has(project.id), `project ${project.id} is not referenced anywhere`).toBe(true);
    }
  });

  it('all depth ranges are valid and within 0–1000', () => {
    for (const item of [...seed.timelineSegments, ...seed.segmentCards]) {
      expect(item.depthStart, `${item.id} depthStart`).toBeGreaterThanOrEqual(0);
      expect(item.depthEnd, `${item.id} depthEnd`).toBeLessThanOrEqual(1000);
      expect(item.depthStart, `${item.id} start < end`).toBeLessThan(item.depthEnd);
    }
  });

  it('segments do not overlap', () => {
    const sorted = [...seed.timelineSegments].sort((a, b) => a.depthStart - b.depthStart);
    for (let i = 1; i < sorted.length; i++) {
      expect(
        sorted[i].depthStart,
        `${sorted[i].id} overlaps ${sorted[i - 1].id}`
      ).toBeGreaterThan(sorted[i - 1].depthEnd);
    }
  });

  it('cards stay within their segment and do not overlap siblings', () => {
    const segmentsById = new Map(seed.timelineSegments.map(segment => [segment.id, segment]));

    for (const segment of seed.timelineSegments) {
      const cards = seed.segmentCards
        .filter(card => card.segmentId === segment.id)
        .sort((a, b) => a.depthStart - b.depthStart);

      for (const card of cards) {
        const parent = segmentsById.get(card.segmentId)!;
        expect(card.depthStart, `${card.id} starts before segment`).toBeGreaterThanOrEqual(parent.depthStart);
        expect(card.depthEnd, `${card.id} ends after segment`).toBeLessThanOrEqual(parent.depthEnd);
      }

      for (let i = 1; i < cards.length; i++) {
        expect(
          cards[i].depthStart,
          `${cards[i].id} overlaps ${cards[i - 1].id}`
        ).toBeGreaterThan(cards[i - 1].depthEnd);
      }
    }
  });

  it('every project startDate is a valid ISO date', () => {
    for (const project of seed.projects) {
      expect(Number.isNaN(Date.parse(project.startDate)), `${project.id} startDate`).toBe(false);
    }
  });
});

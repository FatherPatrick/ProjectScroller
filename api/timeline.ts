import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSeedData } from './_lib/data';

export default function handler(_req: VercelRequest, res: VercelResponse): void {
  const data = getSeedData();

  res.status(200).json({
    timelineSegments: data.timelineSegments,
    segmentCards: data.segmentCards || []
  });
}

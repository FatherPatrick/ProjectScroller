import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSeedData } from '../_lib/data';

export default function handler(req: VercelRequest, res: VercelResponse): void {
  const slug = req.query.slug;
  const normalizedSlug = Array.isArray(slug) ? slug[0] : slug;

  if (!normalizedSlug) {
    res.status(400).json({ message: 'Project slug is required.' });
    return;
  }

  const data = getSeedData();
  const project = data.projects.find((entry) => entry.slug === normalizedSlug);

  if (!project) {
    res.status(404).json({ message: 'Project not found.' });
    return;
  }

  res.status(200).json({ project });
}

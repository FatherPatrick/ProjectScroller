import http from 'http';
import { URL } from 'url';

const PORT = 3001;

// Minimal shim to make Vercel-style handlers work in plain Node HTTP server
function createVercelShim(req: http.IncomingMessage, res: http.ServerResponse, query: Record<string, string>) {
  const vercelReq = Object.assign(req, { query, cookies: {}, body: null }) as any;

  const vercelRes = Object.assign(res, {
    status(code: number) {
      res.statusCode = code;
      return vercelRes;
    },
    json(data: unknown) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(JSON.stringify(data));
      return vercelRes;
    },
    send(data: string | Buffer) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(data);
      return vercelRes;
    },
  }) as any;

  return { vercelReq, vercelRes };
}

const server = http.createServer(async (req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.writeHead(204);
    res.end();
    return;
  }

  const baseUrl = `http://localhost:${PORT}`;
  const parsedUrl = new URL(req.url || '/', baseUrl);
  const pathname = parsedUrl.pathname;
  const query: Record<string, string> = {};
  parsedUrl.searchParams.forEach((value, key) => { query[key] = value; });

  const { vercelReq, vercelRes } = createVercelShim(req, res, query);

  try {
    if (pathname === '/api/timeline') {
      const { default: handler } = await import('./api/timeline.js');
      handler(vercelReq, vercelRes);

    } else if (pathname === '/api/projects') {
      const { default: handler } = await import('./api/projects/index.js');
      handler(vercelReq, vercelRes);

    } else if (pathname.startsWith('/api/projects/')) {
      const slug = pathname.split('/').filter(Boolean).pop() || '';
      vercelReq.query.slug = slug;
      const { default: handler } = await import('./api/projects/[slug].js');
      handler(vercelReq, vercelRes);

    } else {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  } catch (err) {
    console.error('[API Server Error]', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
});

server.listen(PORT, () => {
  console.log(`\n  API server running at http://localhost:${PORT}\n`);
});

# ProjectScroller

ProjectScroller is an interactive portfolio that lets users travel through project history by scrolling through a depth-based tunnel. As depth increases, the UI transitions from high-level timeline segments to project cards and detailed project views.

## What This Project Is

- A single-repo frontend + API application
- A cinematic scroll-to-zoom portfolio experience
- Data-driven timeline rendering (segments and projects come from API data)
- Built for simple unified deployment on Vercel

## Current Experience

- Wheel and pinch input control zoom depth
- Depth-based visual tunnel with ring layers and glow effects
- Mini timeline jump navigation for quick movement between segments
- Keyboard support for segment and depth navigation
- Project cards tied to the active segment
- Project detail panel with tags, technologies, and links
- Reduced-motion behavior support

## Technology Choices

### Frontend

- Angular 21 (standalone components)
- TypeScript
- Angular Signals for app state
- RxJS for normalized input streams
- SCSS for visual system and motion styling

Why this stack:

- Angular provides strong structure for feature growth
- Signals keep animation/state logic simple and predictable
- SCSS + CSS transforms support the 2.5D visual style without introducing WebGL complexity early

### Backend

- Vercel-style API routes in TypeScript/Node
- Seeded JSON data source for now

Why this approach:

- Fast iteration during product shaping
- Same repository and deployment target as frontend
- Easy migration path to a real database later

### Local Dev Tooling

- concurrently for running frontend + API together
- tsx for local TypeScript API server runtime

## Architecture Summary

- frontend: Angular application and UI
- api: route handlers for timeline and project data
- db: seed data used by API
- dev-api-server.ts: local API server shim for development

Core runtime flow:

1. Input normalizer converts wheel/pinch into a stable zoom delta stream
2. Zoom engine applies damping/easing and updates zoom depth
3. Depth resolver determines active segment and visible depth bands
4. Project panel renders projects for the active segment
5. API provides timeline and project payloads

## API Endpoints

- GET /api/timeline
- GET /api/projects
- GET /api/projects/:slug

## Getting Started

### Prerequisites

- Node.js 20+ recommended
- npm 10+ (project currently uses npm)

### Install

```bash
npm install
```

### Run Development Mode

```bash
npm run dev
```

This starts:

- Local API server on port 3001
- Angular dev server on port 4200

Open the app at:

- http://localhost:4200

### Build

```bash
npm run build
```

This builds the Angular frontend production bundle.

## Controls

### Mouse / Touch

- Scroll up: zoom deeper
- Scroll down: zoom outward
- Pinch in/out: zoom depth on touch devices

### Keyboard

- Left / Right (or Up / Down): move between timeline segments
- + / = / PageUp: increase depth
- - / _ / PageDown: decrease depth
- Home: jump to first segment
- End: jump to last segment

## Accessibility Notes

Implemented baseline accessibility features:

- prefers-reduced-motion support
- keyboard navigation alternatives for all core zoom actions
- ARIA live status updates for active segment/depth
- visible focus styles on interactive controls
- responsive behavior for mobile layouts

## Deployment Notes

The project is structured for unified deployment (frontend + API) with Vercel. Local development currently uses Angular dev server + local API server for reliability and fast iteration.

## Future To-Do

### Product / UX

- Improve project reveal thresholds and hysteresis tuning
- Add richer deep-linking (project-level URL state)
- Add loading skeletons and empty/error micro-states in panels

### Data / Backend

- Replace seed JSON with persistent database (Vercel Postgres or managed Postgres)
- Add schema migration and seed pipeline
- Add lightweight admin/content update workflow

### Frontend / Performance

- Lazy-load heavy media and detail content
- Add virtualization strategy if project list grows significantly
- Evaluate optional Three.js tunnel spike if 2.5D CSS ceiling is reached

### Quality / Operations

- Add automated tests for zoom engine and depth resolver behavior
- Add end-to-end smoke tests for key navigation flows
- Add telemetry hooks for interaction tuning
- Add CI checks for build + lint + test

## Project Status

- Foundation, zoom engine, tunnel visual system, navigation jumps, project cards/detail, and accessibility hardening are implemented.
- Remaining work is focused on data persistence, production observability, and QA automation.

## TODO

- Add year in the top right card to give context of ordering
# Cleanup & Professionalism TODO

A prioritized punch list for making ProjectScroller feel production-grade. Items reference the file they live in.

## 1. Quick wins (do these first)

- [x] **Fix the page title and meta tags** — `frontend/src/index.html` currently says `<title>Frontend</title>` and has no meta description, Open Graph, or Twitter card tags. This is what recruiters see in the browser tab, link previews, and Google results. Add:
  - `<title>Patrick Park — Software Engineer Portfolio</title>`
  - `<meta name="description" ...>`, `og:title`, `og:description`, `og:image` (a screenshot of the tunnel), `og:url`, `twitter:card`
- [x] **Fix the a11y contradiction on tunnel cards** — `frontend/src/app/app.html`: `.tunnel-slides` has `aria-hidden="true"` but contains clickable `<article>` elements with `(click)` handlers. Screen readers are told the content doesn't exist, yet it's interactive. Either make the articles real buttons and remove `aria-hidden`, or keep `aria-hidden` and provide an equivalent accessible list elsewhere (keyboard nav + mini-timeline may already cover this — verify with a screen reader).
- [x] **Remove or wire up dead seed data** — `db/seed-data.json` has orphaned projects never referenced by any segment or card: `proj-research-lab`, `proj-career-portal`, `proj-role-ui-lead`. They look like leftover placeholder/demo content ("Career Operations Portal", "UI Modernization Lead") and would be confusing if they ever leak into the UI.
- [ ] **Self-host the A-Life capstone image** — the `lh3.googleusercontent.com` URL in `db/seed-data.json` is a session-scoped Google Sites URL that can expire at any time. Download it to `frontend/public/assets/projects/` like the other images.
- [x] **Fix the two failing unit tests** — `frontend/src/app/app.spec.ts` fails because the test environment lacks a `window.matchMedia` mock. Add a stub in the test setup file (or use `vi.stubGlobal`). Right now the test suite cries wolf, which is worse than no tests.

## 2. Code organization

- [ ] **Split `app.ts` (~950 lines) into focused pieces.** It currently owns slide math, resume rendering, modals, lightbox, keyboard nav, scroll animation, and data loading. Natural seams:
  - `tunnel-slides` component (template block + `calculate*Slide` + `tunnelSlides` computed)
  - `resume-modal` and `about-me-modal` components
  - a `TunnelGeometryService` for the depth→transform math
- [x] **Collapse the four near-identical `calculate*Slide` methods** — `calculateMainSlide`, `calculateSegmentCardSlide`, `calculateSubmilestoneSlide`, `calculateChoiceSlide` in `frontend/src/app/app.ts` share ~80% of their body (relative depth, fade, scale, blur, lane offset, transform string). Extract one `computeSlideTransform(depth, currentDepth, options)` helper; each variant becomes a few lines of config (`baseLaneOffset`, scale range, opacity multiplier).
- [x] **Centralize tuning constants** — the same concepts are duplicated across files: `MAX_DEPTH = 1000` lives in `zoom-engine.service.ts`, `app-state.service.ts`, and `depth-band-resolver.service.ts`; the depth/spacing/motion knobs live at the top of `app.ts`; wheel sensitivity in `input-normalizer.service.ts`. Create one `tunnel-config.ts` so tuning the feel is a one-file job.
- [x] **Delete dead code** — `depth-band-resolver.service.ts` has a `resolvedBands` computed that always returns `[]` and appears unwired. Remove it or finish it.
- [ ] **Split `app.scss` (~31 KB, over the 24 KB budget)** — move component-specific styles alongside the components they style when extracting components above. The kaleidoscope/ring styles alone are hundreds of lines.

## 3. Tooling, CI, and hygiene

- [x] **Add ESLint + Prettier** — there is no lint config in the repo. `ng add angular-eslint`, plus a Prettier config, plus a `npm run lint` script.
- [x] **Add a GitHub Actions workflow** — no `.github/` exists. A minimal CI: install, lint, test, build on PRs to `main`. Vercel already builds on push, but CI catches breakage before merge and looks professional on a public repo.
- [x] **Adjust or meet the bundle budget** — build warns: initial bundle 877 KB vs 500 KB budget. Three.js is the bulk. Options: lazy-load the `ThreeTunnelComponent` (dynamic `import()` after first paint, show the CSS-only background until then), or raise the budget consciously in `angular.json` with a comment.
- [x] **Fix the mammoth CommonJS warning** — `mammoth/mammoth.browser` is CJS and bails out of optimization. It's already lazy-imported (good); silence via `allowedCommonJsDependencies` in `angular.json`, or consider pre-converting the resume to HTML at build time and dropping the 500 KB dependency entirely.
- [x] **Consistent line endings** — git warns about LF/CRLF churn. Add a `.gitattributes` with `* text=auto eol=lf`.

## 4. UX / content polish

- [x] **Rename the resume file generically** — `PatrickParkResume2026.docx` is hardcoded in `app.ts`. Use `resume.docx` (or better, also ship a PDF — most recruiters expect PDF) so a yearly update doesn't require a code change.
- [ ] **Add a favicon set + web manifest** — there's a single `wizard-transparent.png`. Generate proper sizes (16/32/180/512) and a `site.webmanifest`.
- [ ] **First-visit onboarding hint** — the tunnel is unusual navigation; the instructions live in body copy. Consider a one-time dismissible overlay ("Scroll to travel · ↑↓ step cards · click a card for details") that never shows again (localStorage).
- [ ] **Mobile audit** — verify pinch-zoom feel, card readability at `min(68vw, 34rem)` width, the right-edge nav buttons not overlapping cards on small screens, and the fixed mini-timeline on short viewports.
- [x] **404 / error states** — the timeline load error is plain text. Style it, and add a retry button.
- [ ] **Unify the accent story** — the UI chrome is mint/teal (`--accent: #5effc7`) while the visualizer is now Neon magenta/violet/cyan. Decide deliberately: either tint the chrome toward the Neon palette or keep mint as the brand accent everywhere. Right now it's split-brain.

## 5. Testing (beyond the two broken specs)

- [ ] **Unit-test the pure math** — `computeSlideTransform` (once extracted), `sampleXboxHue`, `stepBeat` target selection, and `stageContentYear` interpolation are pure functions begging for cheap tests.
- [ ] **Add one Playwright smoke test** — boot the app, assert the tunnel renders, arrow-key to the next card, click it, assert the projects panel scrolled into view. Catches the "navigation silently broke" class of bug this repo is most prone to.
- [x] **Guard the seed data** — a tiny test validating `db/seed-data.json`: depth ranges don't overlap within a segment, every `projectId` referenced by a card exists, every card's `segmentId` exists. Prevents silent data typos as new roles/projects are added.

## 6. Performance

- [x] **Pause the visualizer when off-screen** — the three.js rAF loop runs even when the user has scrolled down to the projects panel. Use an IntersectionObserver on the canvas host to skip rendering (not just reduce motion) when the stage is out of view; saves battery and keeps scrolling in the details section smooth.
- [ ] **Throttle `tunnelSlides` recompute cost** — every depth change recomputes transforms for all slides, including culled ones. Cheap now, but if the timeline grows, early-exit before building the transform string for slides beyond `DEPTH_VISIBILITY_RANGE`.
- [ ] **Preload the first project images** — detail-view images load on click; add `loading="lazy"` where they're below the fold and consider `fetchpriority="high"` for the first visible one.

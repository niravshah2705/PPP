# @ppp/web

React front-end for the PPP exercise platform.

## Embeddable exercise demo (NIR-777)

Route **`/embed/exercise/:id`** renders _only_ the looping 3D demo scene — no
player controls, no tracking overlay, no session chrome — so it can be dropped
into an iframe.

- The 3D visuals live in a single reusable component, [`ExerciseScene`](src/components/ExerciseScene.tsx),
  driven by the WebGL [`createDemoScene`](src/scene/demoScene.ts) renderer. The
  same component powers the full session player (`/exercise/:id`) **with** chrome
  and the embed **without** chrome (`demoOnly`), keeping one source of truth for
  the demo visuals.
- The exercise is loaded via `GET /api/exercises/:id`.
- An invalid id renders a compact [`InlineErrorCard`](src/components/InlineErrorCard.tsx)
  instead of a blank page.
- WebGL/GPU resources are released when the scene unmounts (`dispose()`).

The doctor template preview embeds this route via an iframe — see
[`DoctorExercisePreview`](src/components/DoctorExercisePreview.tsx) — instead of
re-implementing the scene.

## Scripts

```bash
npm install
npm run dev      # vite dev server (proxies /api -> API_PROXY_TARGET, default :3001)
npm run build    # type-check + production build
npm run test     # vitest unit tests
npm run lint     # eslint
```

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

## Graceful degradation: camera & WebXR (NIR-783)

The demo runs on varied devices, so a denied camera or a browser without WebXR
must never dead-end the patient. The full session player at **`/exercise/:id`**
degrades gracefully instead of failing:

- Capability detection lives in [`deviceCapabilities`](src/lib/deviceCapabilities.ts):
  `requestCamera()` classifies `getUserMedia` into `granted` / `denied` /
  `no-camera` / `unsupported` / `error`, and `detectWebXRSupport()` reports
  whether `navigator.xr` can start an `immersive-vr` session.
- Tracking-wiring [`useExerciseTracking`](src/hooks/useExerciseTracking.ts)
  probes the camera on mount and watches the live track for loss (`ended` /
  `mute`). Any unavailable/lost camera drops the player into **manual** mode —
  recorded reps are preserved across the transition.
- [`SessionPlayer`](src/components/SessionPlayer.tsx) composes the scene with the
  tracking-wiring: it shows a "Tracking active" overlay when the camera is live,
  or a clear [`CameraNotice`](src/components/CameraNotice.tsx) plus a manual
  "Count rep" control otherwise, so the session always progresses.
- WebXR gating is owned by [`ExerciseScene`](src/components/ExerciseScene.tsx):
  the inline 3D demo always renders (the 2D-screen fallback), and the Enter-VR
  button appears **only** when WebXR is supported.

Behaviour matrix:

| Condition | Player behaviour |
| --- | --- |
| Camera denied / no camera | Clear notice + manual rep counting; session continues |
| WebXR unsupported | Inline 3D demo renders; **no** Enter-VR button |
| Camera revoked mid-session | Tracking pauses, manual completion offered, recorded reps kept |

Component tests mock `getUserMedia` and `navigator.xr` to verify each path — see
`test/lib/deviceCapabilities.test.ts`, `test/hooks/useExerciseTracking.test.ts`,
`test/components/SessionPlayer.test.tsx`, and `test/components/ExerciseScene.test.tsx`.

## Save plan + shareable patient link (NIR-764)

Saving a draft turns it into a persisted plan the patient can open, completing
the doctor's hand-off. The builder ([`PlanDraftEditor`](src/components/PlanDraftEditor.tsx))
drives the whole path:

- **Save** calls [`savePlan`](src/api/plans.ts): a draft without an `id` is
  `POST /api/plans` (create); one carrying an `id` (opened along the edit path)
  is `PUT /api/plans/:id`, so editing a previously loaded plan updates it in
  place — no duplicate — with the server keeping `createdAt` and bumping
  `updatedAt`.
- **Confirmation** shows the returned **plan id**, a **copyable** patient link,
  and an **"open as patient"** shortcut. The link is built by the single
  source of truth [`patientPlanPath`](src/lib/planLink.ts) as
  `/patient?planId=...` — the exact route the patient view resolves — so the
  doctor and patient views connect through one persisted plan. Every
  "share with patient" surface (plan list copy, empty-session prompt) resolves
  through the same helper.
- **Errors don't lose the draft.** Backend field errors (HTTP 422) map to inline
  messages on the offending controls; a save conflict (409 → `PlanConflictError`)
  or a network failure (`PlanLoadError`) leaves the draft intact and offers a
  **Retry**.

Covered by `test/components/PlanDraftEditor.test.tsx`, `test/api/plans.test.ts`,
`test/lib/planLink.test.ts`, and the `test/e2e/doctorPlanBuilder.e2e.test.tsx`
hand-off flow.

## Scripts

```bash
npm install
npm run dev      # vite dev server (proxies /api -> API_PROXY_TARGET, default :3001)
npm run build    # type-check + production build
npm run test     # vitest unit tests
npm run lint     # eslint
```

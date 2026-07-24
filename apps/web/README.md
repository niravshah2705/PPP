# @ppp/web

React front-end for the PPP exercise platform.

## Joint-angle rep counter + stage detection (NIR-771)

Automatic rep counting is the core monitoring signal every downstream feature
(sequencer set-completion, live form overlay, session results) consumes. The
pure module [`repCounter`](src/lib/repCounter.ts) turns a pose **landmark
stream** into reps/holds using each exercise's tracking config
([`ExerciseTracking`](src/types/exercise.ts)).

- **Angle from landmarks.** `computeJointAngle` derives the interior angle at the
  configured `angleJoint` (a `from → vertex → to` landmark triplet) via a
  numerically-robust `atan2(|v1×v2|, v1·v2)`.
- **Hysteretic stage detection.** The band between `repDownAngle` and
  `repUpAngle` is a dead-zone: the stage only flips once the angle fully crosses
  a threshold, so noise near one threshold cannot bounce the stage. A rep is a
  complete **down→up** cycle, counted exactly once. Works whether extension or
  flexion is the "up" stage (inferred from which threshold is larger).
- **Jitter smoothing.** A moving average (`smoothingWindow`) damps a spurious
  spike so it cannot cross a threshold and double-count. Partial movements that
  never cross both thresholds are never counted.
- **Hold-type exercises.** When `holdAngle` is set, the module accumulates
  sustained seconds past the target (`holdDirection` `below`/`above`) from frame
  timestamps instead of counting reps.
- **Confidence gating.** Frames whose landmark confidence is below
  `minConfidence` (or that are geometrically degenerate) **pause** tracking —
  angle/stage/hold state is left untouched and resumes cleanly, and paused gaps
  never inflate hold seconds.
- **Deterministic & testable.** The core is a pure reducer,
  `observeFrame(state, frame) → { state, events }` (plus `observeSequence`), so
  recorded landmark fixtures reproduce identical reps/holds/events. `RepCounter`
  is a thin stateful wrapper that dispatches `repCompleted` (and stage / hold /
  pause) events to listeners for real-time use.

Covered by `test/lib/repCounter.test.ts`, driven by the coordinate fixtures in
`test/fixtures/landmarks.ts`.

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

## Start session + record per-exercise results (NIR-767)

Monitoring needs a record of what happened, so opening a plan as a patient at
**`/patient?planId=`** creates and updates a **Session** as the patient works
through the plan. This is the backbone later pose-tracking features feed into.

- **Load + resume.** [`PatientPlanPage`](src/routes/PatientPlanPage.tsx) resolves
  the plan behind the `planId` query param (the exact link the doctor shares, via
  [`patientPlanPath`](src/lib/planLink.ts)) through [`usePlan`](src/hooks/usePlan.ts).
  On open, [`PatientPlanPlayer`](src/components/PatientPlanPlayer.tsx) checks the
  plan's sessions and — because a tab closed mid-session leaves a record
  `in_progress` — surfaces a **resume prompt** ([`findResumableSession`](src/lib/planSession.ts))
  offering _Resume_ or _Start over_.
- **Start.** Start opens a new `in_progress` session via
  [`createSession`](src/api/sessions.ts) (`POST /api/sessions`), tied to the loaded
  plan's `planId` and `patientName`.
- **Record as you go.** The plan's dosage items become the sequencer's exercise
  list ([`planToSequencerExercises`](src/lib/planSession.ts)); each finished
  exercise's aggregate (reps/form/ROM) is handed to
  [`useSessionRecorder`](src/hooks/useSessionRecorder.ts), which **debounces and
  batches** the `PATCH /api/sessions/:id`.
- **No data loss.** The [`SessionResultRecorder`](src/lib/sessionRecorder.ts)
  keeps a local, exerciseId-keyed **buffer**: a failed PATCH is _kept_ and retried
  on the next transition (next exercise, an explicit retry, or finalise), so a
  transient network error never discards buffered results.
- **Finalise.** On completion the session is finalised
  ([`finalizeSession`](src/api/sessions.ts) → `status: 'completed'`, `completedAt`)
  — but only once the buffer has drained, so finishing never abandons unsaved
  results. A failed flush/finalise leaves a clear retry affordance.

Covered by `test/api/sessions.test.ts`, `test/lib/sessionRecorder.test.ts`,
`test/lib/planSession.test.ts`, `test/hooks/useSessionRecorder.test.ts`, and the
`test/components/PatientPlanPlayer.test.tsx` start→record→retry→finalise flow.

## Load & display assigned plan for a patient (NIR-765)

The patient's entry point is _reading_ the plan the doctor assigned, so
**`/patient`** first shows a read-only overview before any session starts.

- **Two ways in.** [`usePatientPlan`](src/hooks/usePatientPlan.ts) resolves the
  plan from the URL: a `?planId=` loads that plan's share payload directly
  (`GET /api/plans/:id/share`), or a `?patientName=` resolves the patient's
  **most recent** plan via [`fetchMostRecentPlanIdForPatient`](src/api/plans.ts)
  (`GET /api/plans?patientName=` → newest by `updatedAt`, exact-match only via
  the pure [`mostRecentPlanForPatient`](src/lib/planList.ts)) and then loads it.
- **Read-only overview.** [`PlanOverview`](src/components/PlanOverview.tsx)
  renders the patient name, each exercise with its `sets × reps/hold` target and
  a guidance note, the **estimated total duration**, and a single **Start**
  button. The presentation-only model is built by the pure
  [`buildPlanOverview`](src/lib/planOverview.ts); duration is derived from every
  item's sets/reps/hold/rest via the shared
  [`estimatePlanDurationSeconds`](src/lib/planDraft.ts), so the patient overview
  and doctor builder always agree.
- **Start hands off.** Pressing Start mounts the
  [`PatientPlanPlayer`](src/components/PatientPlanPlayer.tsx) with `autoStart`, so
  the session begins without a second click — while an in-progress session still
  surfaces the resume prompt for the patient to decide.
- **Never a dead end.** A missing/blank identifier, an unknown `planId`, or a
  patient with no plan renders a friendly empty state (not a crash); a plan with
  zero exercises shows a clear "no exercises assigned" message instead of a Start
  button that does nothing.

Covered by `test/lib/planOverview.test.ts`, `test/lib/planList.test.ts`,
`test/api/plans.test.ts`, `test/components/PlanOverview.test.tsx`, and the
`test/routes/PatientPlanPage.test.tsx` resolution + empty-state flows.

## Patient context selector (NIR-759)

With no authentication, every plan must still be tied to a patient, so the doctor
picks one _before_ building anything. A single header control
([`PatientContextSelector`](src/components/PatientContextSelector.tsx), mounted in
[`AppHeader`](src/components/AppHeader.tsx)) owns that choice:

- **Shared store + URL.** [`PatientProvider`](src/context/PatientContext.tsx) holds
  the working `patientName` in React state (so it survives client-side route
  changes) and mirrors it into the `?patient=` query of the active URL (so a hard
  refresh or deep link restores it). `usePatientContext` reads it; downstream
  builders read it through the same context.
- **Typeahead of previous patients.** The selector suggests distinct,
  previously-used names via [`fetchPatientNameSuggestions`](src/api/plans.ts)
  (`GET /api/plans?patientName=<query>`), debounced through
  [`usePatientSuggestions`](src/hooks/usePatientSuggestions.ts) and reduced with
  the pure [`distinctPatientNames`/`filterPatientSuggestions`](src/lib/patientSuggestions.ts).
- **Gated builder actions.** [`PlanDraftEditor`](src/components/PlanDraftEditor.tsx)
  reads the patient from context: with none set (including an empty or
  whitespace-only name) the save/assign action is **disabled** with an inline hint
  explaining why. Opening a plan for edit adopts that plan's patient; duplicating
  clears it for reassignment.
- **No silent context loss.** Changing the patient while an unsaved draft is in
  progress prompts the doctor to confirm or cancel instead of swapping context
  underneath them.

Covered by `test/lib/patientSuggestions.test.ts`, `test/api/patientSuggestions.test.ts`,
`test/components/PatientContextSelector.test.tsx`, and
`test/components/PlanDraftEditor.context.test.tsx`.

## Scripts

```bash
npm install
npm run dev      # vite dev server (proxies /api -> API_PROXY_TARGET, default :3001)
npm run build    # type-check + production build
npm run test     # vitest unit tests
npm run lint     # eslint
```

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TemplatesPage } from '../../src/routes/TemplatesPage';
import { fetchPlan } from '../../src/api/plans';
import type { Exercise } from '../../src/types/exercise';
import type { Plan } from '../../src/types/plan';
import type { PlanDraft } from '../../src/types/template';
import type { Template } from '../../src/types/template';

/**
 * End-to-end coverage for the doctor plan-builder hand-off (NIR-785).
 *
 * The UI (real page/components + real `src/api` client code) is driven against
 * an in-memory "temporary store" backing a routed `fetch`, rather than mocking
 * the client. This exercises the whole template → customize → save → share path
 * exactly as production would hit the API, and asserts what is actually
 * persisted (the POST body and the store) plus the generated patient link and
 * that it resolves through the share endpoint. It also proves the
 * validation-error path blocks the save and persists nothing.
 */

const TEMPLATE: Template = {
  id: 'tmpl-knee',
  name: 'Knee rehab',
  description: 'Post-op knee recovery',
  categoryTags: ['knee'],
  items: [{ exerciseId: 'knee-flex', sets: 3, reps: 10, hold: 5, rest: 30 }],
};

const LIBRARY: Exercise[] = [
  { id: 'knee-flex', name: 'Knee Flexion', category: 'knee' },
  { id: 'knee-ext', name: 'Knee Extension', category: 'knee' },
  { id: 'hip-abd', name: 'Hip Abduction', category: 'hip' },
];

/**
 * A tiny in-memory API server: real HTTP shapes over a mutable store. Records
 * write bodies so a test can assert exactly what the UI sent, and exposes the
 * share endpoint (`GET /api/plans/:id`) the patient link resolves through.
 */
class TempStore {
  plans: Plan[] = [];
  templates: Template[] = [structuredClone(TEMPLATE)];
  exercises: Exercise[] = structuredClone(LIBRARY);
  posted: PlanDraft[] = [];
  private seq = 0;

  private json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  handle = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = url.split('?')[0];

    if (method === 'GET' && path === '/api/templates') return Promise.resolve(this.json(this.templates));
    if (method === 'GET' && path === '/api/exercises') return Promise.resolve(this.json(this.exercises));
    if (method === 'GET' && path === '/api/plans') return Promise.resolve(this.json(this.plans));

    if (method === 'POST' && path === '/api/plans') {
      const draft = JSON.parse(String(init?.body ?? '{}')) as PlanDraft;
      this.posted.push(draft);
      const template = this.templates.find((t) => t.id === draft.templateId);
      const plan: Plan = {
        id: `plan-${++this.seq}`,
        patientName: draft.patientName ?? '',
        templateId: draft.templateId,
        templateName: draft.templateName ?? template?.name,
        items: draft.items,
        updatedAt: '2024-06-01T12:00:00.000Z',
      };
      this.plans.push(plan);
      return Promise.resolve(this.json(plan, 201));
    }

    const byId = /^\/api\/plans\/(.+)$/.exec(path);
    if (byId) {
      const id = decodeURIComponent(byId[1]);
      const existing = this.plans.find((p) => p.id === id);
      if (method === 'GET') {
        return existing
          ? Promise.resolve(this.json(existing))
          : Promise.resolve(this.json({ error: 'not found' }, 404));
      }
      if (method === 'PUT') {
        const draft = JSON.parse(String(init?.body ?? '{}')) as PlanDraft;
        this.posted.push(draft);
        if (!existing) return Promise.resolve(this.json({ error: 'not found' }, 404));
        Object.assign(existing, {
          patientName: draft.patientName ?? existing.patientName,
          items: draft.items,
          updatedAt: '2024-06-02T12:00:00.000Z',
        });
        return Promise.resolve(this.json(existing));
      }
    }

    return Promise.resolve(this.json({ error: `unhandled ${method} ${path}` }, 500));
  };
}

let store: TempStore;
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  store = new TempStore();
  fetchSpy = vi.fn(store.handle);
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

/** Open the builder from the template gallery and wait for its library to load. */
async function openBuilderFromTemplate(user: ReturnType<typeof userEvent.setup>) {
  render(
    <MemoryRouter>
      <TemplatesPage />
    </MemoryRouter>,
  );

  await user.click(await screen.findByTestId(`template-use-${TEMPLATE.id}`));
  const builder = await screen.findByTestId('plan-draft-editor');
  // The add-exercise picker resolves the library before we can append.
  await screen.findByTestId('exercise-option-knee-ext');
  return builder;
}

describe('doctor plan-builder flow (E2E, real API on a temporary store)', () => {
  it('goes template → customize → save, persisting the edits and a resolvable patient link', async () => {
    const user = userEvent.setup();
    await openBuilderFromTemplate(user);

    // Assign the patient.
    await user.type(screen.getByTestId('plan-draft-patient'), 'Ada Lovelace');

    // Customize the template item's sets/reps.
    const sets = screen.getByTestId('item-0-sets');
    await user.clear(sets);
    await user.type(sets, '4');
    const reps = screen.getByTestId('item-0-reps');
    await user.clear(reps);
    await user.type(reps, '12');

    // Add an extra exercise beyond the template.
    await user.click(screen.getByTestId('exercise-option-knee-ext'));
    expect(screen.getByTestId('plan-draft-summary')).toHaveTextContent('2 exercises in plan');

    // Save.
    await user.click(screen.getByTestId('plan-draft-save'));
    await screen.findByTestId('plan-draft-saved');

    // 1) The POST body carries the patient, template provenance, and the edits.
    expect(store.posted).toHaveLength(1);
    const body = store.posted[0];
    expect(body.patientName).toBe('Ada Lovelace');
    expect(body.templateId).toBe(TEMPLATE.id);
    expect(body.items).toEqual([
      { exerciseId: 'knee-flex', sets: 4, reps: 12, hold: 5, rest: 30 },
      { exerciseId: 'knee-ext', sets: 1, reps: 10, hold: 0, rest: 30, order: 1 },
    ]);

    // 2) Exactly one plan was persisted, matching the edits.
    expect(store.plans).toHaveLength(1);
    const persisted = store.plans[0];
    expect(persisted.patientName).toBe('Ada Lovelace');
    expect(persisted.templateName).toBe('Knee rehab');
    expect(persisted.items).toEqual(body.items);

    // 3) The confirmation shows the returned plan id and the generated patient link.
    expect(screen.getByTestId('plan-draft-plan-id')).toHaveTextContent(persisted.id);
    const link = screen.getByTestId('plan-draft-share-link');
    const expectedUrl = `${window.location.origin}/patient?planId=${persisted.id}`;
    expect(link).toHaveAttribute('href', expectedUrl);
    expect(link).toHaveTextContent(expectedUrl);

    // 4) The generated link resolves via the share endpoint so the two views connect.
    const sharedId = new URL(link.getAttribute('href')!).searchParams.get('planId');
    expect(sharedId).toBe(persisted.id);
    const resolved = await fetchPlan(sharedId!);
    expect(resolved).toEqual(persisted);
    expect(fetchSpy).toHaveBeenCalledWith(`/api/plans/${persisted.id}`, expect.anything());
  });

  it('blocks the save when a field is invalid, surfaces the inline error, and persists nothing', async () => {
    const user = userEvent.setup();
    const builder = await openBuilderFromTemplate(user);

    await user.type(screen.getByTestId('plan-draft-patient'), 'Grace Hopper');

    // Push reps out of the allowed range (1–50).
    const reps = screen.getByTestId('item-0-reps');
    await user.clear(reps);
    await user.type(reps, '99');

    await user.click(screen.getByTestId('plan-draft-save'));

    // The correct inline field error is surfaced on the offending control.
    const repsError = await screen.findByTestId('item-0-reps-error');
    expect(repsError).toHaveTextContent('between 1 and 50');

    // Save was blocked: no write reached the API and nothing is persisted.
    expect(store.posted).toHaveLength(0);
    expect(store.plans).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalledWith('/api/plans', expect.objectContaining({ method: 'POST' }));
    expect(within(builder).queryByTestId('plan-draft-saved')).not.toBeInTheDocument();
  });

  it('requires a patient before saving even when the plan items are valid', async () => {
    const user = userEvent.setup();
    await openBuilderFromTemplate(user);

    // Leave the patient blank and try to save a valid template draft.
    await user.click(screen.getByTestId('plan-draft-save'));

    expect(await screen.findByTestId('plan-draft-patient-error')).toHaveTextContent('Assign a patient');
    expect(store.posted).toHaveLength(0);
    expect(store.plans).toHaveLength(0);
    expect(screen.queryByTestId('plan-draft-saved')).not.toBeInTheDocument();
  });
});

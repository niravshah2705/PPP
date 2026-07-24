import type {
  Template,
  TemplateDetail,
  TemplateDraft,
  TemplatePreviewItem,
} from '../types/template';
import {
  errorsByField,
  validateTemplateDraft,
  type FieldError,
} from '../lib/templateValidation';

/** Thrown when a template id does not resolve to a known template (HTTP 404). */
export class TemplateNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Template "${id}" was not found`);
    this.name = 'TemplateNotFoundError';
  }
}

/** Thrown for transport/server errors while loading or saving templates. */
export class TemplateLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateLoadError';
  }
}

/**
 * Thrown when a draft fails validation — either locally before the request, or
 * by the server (HTTP 422) which mirrors the same plan rules. Carries the
 * field-keyed errors so the form can surface them on the correct controls.
 */
export class TemplateValidationError extends Error {
  public readonly fieldErrors: Record<string, string>;

  constructor(public readonly errors: FieldError[]) {
    super('Template failed validation');
    this.name = 'TemplateValidationError';
    this.fieldErrors = errorsByField(errors);
  }
}

/**
 * Thrown when an exercise cannot be deleted because one or more templates still
 * reference it (HTTP 409). Preserves referential integrity — the caller warns
 * the doctor and lists the blocking templates.
 */
export class ExerciseReferencedError extends Error {
  constructor(
    public readonly exerciseId: string,
    public readonly templates: Array<{ id: string; name: string }>,
  ) {
    super(
      `Exercise "${exerciseId}" is referenced by ${templates.length} template(s) and cannot be deleted`,
    );
    this.name = 'ExerciseReferencedError';
  }
}

async function parseFieldErrors(response: Response): Promise<FieldError[]> {
  try {
    const body = (await response.json()) as { errors?: FieldError[] };
    if (Array.isArray(body?.errors)) return body.errors;
  } catch {
    // fall through to a generic error below
  }
  return [{ field: '', message: `Validation failed (HTTP ${response.status})` }];
}

function assertTemplate(data: unknown): Template {
  const t = data as Template;
  if (!t || typeof t.id !== 'string' || typeof t.name !== 'string' || !Array.isArray(t.items)) {
    throw new TemplateLoadError('Malformed template payload');
  }
  return t;
}

/**
 * List all templates via `GET /api/templates` — the source for the gallery.
 */
export async function listTemplates(signal?: AbortSignal): Promise<Template[]> {
  let response: Response;
  try {
    response = await fetch('/api/templates', {
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (err) {
    throw new TemplateLoadError(
      err instanceof Error ? err.message : 'Network error while loading templates',
    );
  }
  if (!response.ok) {
    throw new TemplateLoadError(`Failed to load templates (HTTP ${response.status})`);
  }
  const data = (await response.json()) as unknown;
  if (!Array.isArray(data)) {
    throw new TemplateLoadError('Malformed templates payload');
  }
  return data.map(assertTemplate);
}

function assertPreviewItem(data: unknown): TemplatePreviewItem {
  const item = data as TemplatePreviewItem;
  if (
    !item ||
    typeof item.exerciseId !== 'string' ||
    !item.exercise ||
    typeof item.exercise.id !== 'string' ||
    typeof item.exercise.name !== 'string'
  ) {
    throw new TemplateLoadError('Malformed template item payload');
  }
  return item;
}

function assertTemplateDetail(data: unknown): TemplateDetail {
  const t = data as TemplateDetail;
  if (
    !t ||
    typeof t.id !== 'string' ||
    typeof t.name !== 'string' ||
    !Array.isArray(t.categoryTags) ||
    !Array.isArray(t.items)
  ) {
    throw new TemplateLoadError('Malformed template payload');
  }
  const items = t.items.map(assertPreviewItem);
  // `itemCount` is the declared total (before missing-exercise items are filtered
  // out); tolerate a server that omits it by falling back to the resolved count.
  const itemCount =
    typeof t.itemCount === 'number' && t.itemCount >= items.length ? t.itemCount : items.length;
  return { ...t, items, itemCount };
}

/**
 * Fetch a single template expanded for the preview panel via
 * `GET /api/templates/:id`. The server resolves each item's exercise (name +
 * thumbnail/demo media) and filters out items whose exercise no longer exists,
 * reporting the declared total via `itemCount` so the UI can note how many were
 * unavailable.
 *
 * - 404 -> {@link TemplateNotFoundError} (caller renders an inline error).
 * - other non-2xx / network failure -> {@link TemplateLoadError}.
 */
export async function getTemplate(id: string, signal?: AbortSignal): Promise<TemplateDetail> {
  const encoded = encodeURIComponent(id);
  let response: Response;
  try {
    response = await fetch(`/api/templates/${encoded}`, {
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (err) {
    throw new TemplateLoadError(
      err instanceof Error ? err.message : 'Network error while loading template',
    );
  }

  if (response.status === 404) {
    throw new TemplateNotFoundError(id);
  }
  if (!response.ok) {
    throw new TemplateLoadError(`Failed to load template (HTTP ${response.status})`);
  }

  return assertTemplateDetail(await response.json());
}

async function sendTemplate(
  url: string,
  method: 'POST' | 'PUT',
  draft: TemplateDraft,
  knownExerciseIds?: ReadonlySet<string>,
): Promise<Template> {
  // Validate client-side first so nothing invalid is ever sent/persisted and
  // errors surface on fields immediately without a round trip.
  const localErrors = validateTemplateDraft(draft, knownExerciseIds);
  if (localErrors.length > 0) {
    throw new TemplateValidationError(localErrors);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(draft),
    });
  } catch (err) {
    throw new TemplateLoadError(
      err instanceof Error ? err.message : 'Network error while saving template',
    );
  }

  if (response.status === 422) {
    // Server mirrors the same plan rules; surface its field errors.
    throw new TemplateValidationError(await parseFieldErrors(response));
  }
  if (response.status === 404) {
    throw new TemplateNotFoundError(draft.id ?? '');
  }
  if (!response.ok) {
    throw new TemplateLoadError(`Failed to save template (HTTP ${response.status})`);
  }

  return assertTemplate(await response.json());
}

/**
 * Create a template via `POST /api/templates`. Validates locally first; on
 * success the created template (with a server id) is returned so it can be
 * shown in the gallery immediately.
 */
export function createTemplate(
  draft: TemplateDraft,
  knownExerciseIds?: ReadonlySet<string>,
): Promise<Template> {
  return sendTemplate('/api/templates', 'POST', draft, knownExerciseIds);
}

/**
 * Update an existing template via `PUT /api/templates/:id`.
 */
export function updateTemplate(
  id: string,
  draft: TemplateDraft,
  knownExerciseIds?: ReadonlySet<string>,
): Promise<Template> {
  const encoded = encodeURIComponent(id);
  return sendTemplate(`/api/templates/${encoded}`, 'PUT', { ...draft, id }, knownExerciseIds);
}

/**
 * Delete an exercise via `DELETE /api/exercises/:id`. If templates still
 * reference it the server responds 409 and this throws {@link
 * ExerciseReferencedError} so the caller can block/warn instead of leaving
 * dangling references.
 */
export async function deleteExercise(id: string): Promise<void> {
  const encoded = encodeURIComponent(id);
  let response: Response;
  try {
    response = await fetch(`/api/exercises/${encoded}`, { method: 'DELETE' });
  } catch (err) {
    throw new TemplateLoadError(
      err instanceof Error ? err.message : 'Network error while deleting exercise',
    );
  }

  if (response.status === 409) {
    let templates: Array<{ id: string; name: string }> = [];
    try {
      const body = (await response.json()) as {
        templates?: Array<{ id: string; name: string }>;
      };
      if (Array.isArray(body?.templates)) templates = body.templates;
    } catch {
      // no body — still a referential-integrity block
    }
    throw new ExerciseReferencedError(id, templates);
  }
  if (response.status === 404) {
    throw new TemplateNotFoundError(id);
  }
  if (!response.ok) {
    throw new TemplateLoadError(`Failed to delete exercise (HTTP ${response.status})`);
  }
}

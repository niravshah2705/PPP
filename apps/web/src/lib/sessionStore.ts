import type { SessionRecord, SessionRecordStatus, SessionResult } from '../types/session';

/**
 * In-memory persistence behaviour for exercise sessions — the handler core the
 * session write/read APIs are built on:
 *
 * - `POST   /api/sessions`      → {@link SessionStore.create}
 * - `PATCH  /api/sessions/:id`  → {@link SessionStore.patch}
 * - `GET    /api/sessions?planId=` → {@link SessionStore.listByPlan}
 * - `GET    /api/sessions/:id`  → {@link SessionStore.get}
 *
 * The store owns the invariants the spec calls out so a thin HTTP layer only has
 * to translate calls to responses and map {@link SessionStoreError.status} to a
 * status code:
 *
 * - The server sets `startedAt` on create and the status starts `in_progress`.
 * - `planId` must resolve to a known plan, else a 400.
 * - PATCH merges per-exercise results by `exerciseId`, clamps `avgFormScore` to
 *   0–100 and the counts/measurements to `>= 0`, and can finalise the session by
 *   setting `status` (and `completedAt`, defaulted to "now" when omitted).
 * - PATCHing an already-finalised (`completed`/`abandoned`) session is a 409.
 * - `abandoned` sessions may be finalised with partial results.
 * - Reads are returned newest-first by `startedAt` and never expose the store's
 *   own record objects (callers get deep copies).
 */

/** HTTP status a {@link SessionStoreError} maps to. */
export type SessionStoreErrorStatus = 400 | 404 | 409;

/** Base error for every store failure; carries the HTTP status to surface. */
export class SessionStoreError extends Error {
  constructor(
    public readonly status: SessionStoreErrorStatus,
    message: string,
  ) {
    super(message);
    this.name = 'SessionStoreError';
  }
}

/** Bad request body / unknown plan (HTTP 400). */
export class SessionValidationError extends SessionStoreError {
  constructor(message: string) {
    super(400, message);
    this.name = 'SessionValidationError';
  }
}

/** No session with the given id (HTTP 404). */
export class SessionNotFoundError extends SessionStoreError {
  constructor(public readonly id: string) {
    super(404, `Session "${id}" was not found`);
    this.name = 'SessionNotFoundError';
  }
}

/** PATCH against an already-finalised session (HTTP 409). */
export class SessionConflictError extends SessionStoreError {
  constructor(
    public readonly id: string,
    public readonly currentStatus: SessionRecordStatus,
  ) {
    super(409, `Session "${id}" is already ${currentStatus} and cannot be modified`);
    this.name = 'SessionConflictError';
  }
}

/** One incoming per-exercise result; every metric is optional and normalised. */
export interface SessionResultInput {
  exerciseId: string;
  targetReps?: number;
  completedReps?: number;
  avgFormScore?: number;
  maxRangeOfMotionDeg?: number;
  durationSeconds?: number;
}

/** Body of `POST /api/sessions`. `results` may seed the session immediately. */
export interface CreateSessionInput {
  planId: string;
  patientName?: string;
  results?: SessionResultInput[];
}

/** Body of `PATCH /api/sessions/:id`. Any subset may be supplied. */
export interface PatchSessionInput {
  results?: SessionResultInput[];
  status?: SessionRecordStatus;
  completedAt?: string;
}

/** Collaborators the store needs; all injectable for deterministic tests. */
export interface SessionStoreOptions {
  /** Returns true when `planId` resolves to a known plan (drives the 400 check). */
  planExists: (planId: string) => boolean;
  /** Clock for `startedAt`/`completedAt`; defaults to the current time. */
  now?: () => string;
  /** Id factory for new sessions; defaults to a monotonic `sess-<n>`. */
  newId?: () => string;
}

const TERMINAL: ReadonlySet<SessionRecordStatus> = new Set(['completed', 'abandoned']);
const STATUSES: ReadonlySet<SessionRecordStatus> = new Set([
  'in_progress',
  'completed',
  'abandoned',
]);

export class SessionStore {
  private readonly records = new Map<string, SessionRecord>();
  /** Insertion order per id, used to break `startedAt` ties deterministically. */
  private readonly insertionOrder = new Map<string, number>();
  private readonly planExists: (planId: string) => boolean;
  private readonly now: () => string;
  private readonly newId: () => string;
  private seq = 0;
  private inserted = 0;

  constructor(options: SessionStoreOptions) {
    this.planExists = options.planExists;
    this.now = options.now ?? (() => new Date().toISOString());
    this.newId = options.newId ?? (() => `sess-${(this.seq += 1)}`);
  }

  /**
   * Open a new session (`POST /api/sessions`). The server assigns the id, stamps
   * `startedAt`, and starts the session `in_progress`. Any seed `results` are
   * merged/normalised just like a PATCH. Unknown/blank `planId` → 400.
   */
  create(input: CreateSessionInput): SessionRecord {
    const planId = requireNonBlank(input.planId, 'planId');
    if (!this.planExists(planId)) {
      throw new SessionValidationError(`Unknown planId "${planId}"`);
    }

    const record: SessionRecord = {
      id: this.newId(),
      planId,
      patientName: typeof input.patientName === 'string' ? input.patientName : '',
      startedAt: this.now(),
      status: 'in_progress',
      results: mergeResults([], input.results ?? []),
    };

    this.records.set(record.id, record);
    this.insertionOrder.set(record.id, (this.inserted += 1));
    return clone(record);
  }

  /**
   * Append/update results and optionally finalise a session
   * (`PATCH /api/sessions/:id`). Results merge by `exerciseId`; only the metrics
   * present in each incoming result override the stored ones. A terminal
   * `status` (`completed`/`abandoned`) sets `completedAt` (defaulting to "now").
   *
   * Unknown id → 404. Already-finalised session → 409. Bad body / invalid
   * numbers / unknown status → 400.
   */
  patch(id: string, patch: PatchSessionInput): SessionRecord {
    const existing = this.records.get(id);
    if (!existing) throw new SessionNotFoundError(id);
    if (TERMINAL.has(existing.status)) {
      throw new SessionConflictError(id, existing.status);
    }

    if (patch.status !== undefined && !STATUSES.has(patch.status)) {
      throw new SessionValidationError(`Unknown status "${patch.status}"`);
    }

    const results = mergeResults(existing.results, patch.results ?? []);
    const status = patch.status ?? existing.status;

    let completedAt = existing.completedAt;
    if (TERMINAL.has(status)) {
      // Finalising: the server stamps completedAt when the caller omits it.
      completedAt = normaliseTimestamp(patch.completedAt) ?? completedAt ?? this.now();
    } else if (patch.completedAt !== undefined) {
      // Non-terminal patch that nonetheless carries a timestamp: honour it.
      completedAt = normaliseTimestamp(patch.completedAt) ?? completedAt;
    }

    const updated: SessionRecord = {
      ...existing,
      results,
      status,
      ...(completedAt !== undefined ? { completedAt } : {}),
    };
    this.records.set(id, updated);
    return clone(updated);
  }

  /**
   * List a plan's sessions (`GET /api/sessions?planId=`), newest-first by
   * `startedAt`. Ties break by insertion order (latest first) so the ordering is
   * deterministic even when timestamps collide.
   */
  listByPlan(planId: string): SessionRecord[] {
    return [...this.records.values()]
      .filter((r) => r.planId === planId)
      .sort((a, b) => {
        const byTime = timestamp(b.startedAt) - timestamp(a.startedAt);
        if (byTime !== 0) return byTime;
        return (this.insertionOrder.get(b.id) ?? 0) - (this.insertionOrder.get(a.id) ?? 0);
      })
      .map(clone);
  }

  /** Fetch one full session (`GET /api/sessions/:id`). Unknown id → 404. */
  get(id: string): SessionRecord {
    const record = this.records.get(id);
    if (!record) throw new SessionNotFoundError(id);
    return clone(record);
  }
}

/**
 * Merge incoming results into a base list, keyed by `exerciseId`. Existing
 * entries keep their order; unseen exercises are appended in input order. Only
 * the metrics present on an incoming result override the stored value, so a
 * PATCH can update a single field without clobbering the rest. All metrics are
 * clamped (`avgFormScore` to 0–100, counts/measurements to `>= 0`).
 */
function mergeResults(
  base: readonly SessionResult[],
  incoming: readonly SessionResultInput[],
): SessionResult[] {
  const byId = new Map<string, SessionResult>();
  const order: string[] = [];
  for (const r of base) {
    byId.set(r.exerciseId, { ...r });
    order.push(r.exerciseId);
  }

  for (const input of incoming) {
    const exerciseId = requireNonBlank(input.exerciseId, 'exerciseId');
    const prev = byId.get(exerciseId);
    if (!prev) order.push(exerciseId);
    byId.set(exerciseId, {
      exerciseId,
      targetReps: nonNeg(input.targetReps, prev?.targetReps ?? 0, 'targetReps'),
      completedReps: nonNeg(input.completedReps, prev?.completedReps ?? 0, 'completedReps'),
      avgFormScore: score(input.avgFormScore, prev?.avgFormScore ?? 0),
      maxRangeOfMotionDeg: nonNeg(
        input.maxRangeOfMotionDeg,
        prev?.maxRangeOfMotionDeg ?? 0,
        'maxRangeOfMotionDeg',
      ),
      durationSeconds: nonNeg(input.durationSeconds, prev?.durationSeconds ?? 0, 'durationSeconds'),
    });
  }

  return order.map((id) => byId.get(id)!);
}

/** Clamp a form score into 0–100. Missing keeps `fallback`; non-finite → 400. */
function score(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new SessionValidationError('avgFormScore must be a finite number');
  }
  return Math.min(100, Math.max(0, value));
}

/** Clamp a count/measurement to `>= 0`. Missing keeps `fallback`; non-finite → 400. */
function nonNeg(value: number | undefined, fallback: number, field: string): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new SessionValidationError(`${field} must be a finite number`);
  }
  return Math.max(0, value);
}

function requireNonBlank(value: string, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new SessionValidationError(`${field} is required`);
  }
  return value;
}

/** Accept a non-blank ISO-ish string, else undefined (server fills in "now"). */
function normaliseTimestamp(value: string | undefined): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  return value;
}

function timestamp(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

/** Deep copy so callers can never mutate the store's authoritative record. */
function clone(record: SessionRecord): SessionRecord {
  return { ...record, results: record.results.map((r) => ({ ...r })) };
}

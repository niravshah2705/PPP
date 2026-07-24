/**
 * Standard error envelope returned by read endpoints for non-2xx responses.
 *
 * A single, predictable shape (`{ error: { code, message } }`) lets the client
 * branch on a stable machine-readable `code` while still having a human-readable
 * `message` to surface. Used, for example, when a template id is unknown (404).
 */
export interface ErrorEnvelope {
  error: {
    /** Stable, machine-readable error code, e.g. `template_not_found`. */
    code: string;
    /** Human-readable explanation safe to log or show in an inline error. */
    message: string;
  };
}

/** Build an {@link ErrorEnvelope} from a code + message. */
export function errorEnvelope(code: string, message: string): ErrorEnvelope {
  return { error: { code, message } };
}

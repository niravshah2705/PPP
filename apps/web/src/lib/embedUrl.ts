/** Canonical path for the embeddable exercise demo route. Single source of truth. */
export function embedExercisePath(id: string): string {
  return `/embed/exercise/${encodeURIComponent(id)}`;
}

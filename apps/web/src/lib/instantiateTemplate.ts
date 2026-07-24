import type { PlanDraft, Template } from '../types/template';

/**
 * Instantiate a plan draft from a template — the template-to-draft flow the
 * plan builder uses to seed a new plan. Pure: the returned draft is a deep-ish
 * copy so later plan edits never mutate the source template's item defaults.
 *
 * @param template The source template.
 * @param overrides Optional overrides, e.g. a custom draft name.
 */
export function instantiateDraftFromTemplate(
  template: Template,
  overrides?: { name?: string },
): PlanDraft {
  return {
    templateId: template.id,
    name: overrides?.name ?? template.name,
    items: template.items.map((item) => ({
      exerciseId: item.exerciseId,
      sets: item.sets,
      reps: item.reps,
      hold: item.hold,
      rest: item.rest,
    })),
  };
}

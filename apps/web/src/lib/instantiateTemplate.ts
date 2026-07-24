import type { PlanDraft, Template } from '../types/template';

/**
 * Instantiate a plan draft from a template — the "Use this template" flow the
 * plan builder uses to seed a new, fully-local editable draft. Pure: nothing is
 * persisted here (premature persistence and duplicate plans are avoided until
 * the explicit save step), and the returned draft's items are a per-item copy
 * so later plan edits never mutate the source template's item defaults.
 *
 * The draft mirrors the template's expanded items and their defaults in order
 * (array position is the item order the builder renders and re-keys from), and
 * records provenance so save/share later resolve correctly:
 * - `sourceTemplateId` and `templateId` both carry `template.id`;
 * - `templateName` carries the template name for display;
 * - `patientName` binds the draft to the current patient when supplied.
 *
 * @param template The source template.
 * @param overrides Optional overrides: a custom draft `name` and/or the current
 *   `patientName` the draft is being built for.
 */
export function instantiateDraftFromTemplate(
  template: Template,
  overrides?: { name?: string; patientName?: string },
): PlanDraft {
  const patientName = overrides?.patientName?.trim();
  return {
    sourceTemplateId: template.id,
    templateId: template.id,
    templateName: template.name,
    name: overrides?.name ?? template.name,
    patientName: patientName ? patientName : undefined,
    items: template.items.map((item) => ({
      exerciseId: item.exerciseId,
      sets: item.sets,
      reps: item.reps,
      hold: item.hold,
      rest: item.rest,
    })),
  };
}

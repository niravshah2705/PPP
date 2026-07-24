import type { TemplateItem } from '../types/template';
import { ITEM_BOUNDS, type ItemBoundField } from '../lib/templateValidation';
import './TemplateItemEditor.css';

export interface TemplateItemEditorProps {
  item: TemplateItem;
  index: number;
  /** Field-keyed error messages (see {@link errorsByField}). */
  fieldErrors: Record<string, string>;
  onChange: (index: number, item: TemplateItem) => void;
  onRemove: (index: number) => void;
}

const NUMERIC_FIELDS: ItemBoundField[] = ['sets', 'reps', 'hold', 'rest'];

const FIELD_LABELS: Record<ItemBoundField, string> = {
  sets: 'Sets',
  reps: 'Reps',
  hold: 'Hold (s)',
  rest: 'Rest (s)',
};

/**
 * Editor for a single template item (exercise + default dosage). This is the
 * shared item editor bound to a template draft item — the same control the plan
 * builder reuses — so dosage bounds and error surfacing stay consistent.
 */
export function TemplateItemEditor({
  item,
  index,
  fieldErrors,
  onChange,
  onRemove,
}: TemplateItemEditorProps) {
  const prefix = `items[${index}]`;
  const exerciseError = fieldErrors[`${prefix}.exerciseId`];

  const update = (patch: Partial<TemplateItem>) => onChange(index, { ...item, ...patch });

  return (
    <fieldset className="template-item" data-testid={`template-item-${index}`}>
      <div className="template-item__row">
        <label className="template-item__field">
          <span>Exercise id</span>
          <input
            type="text"
            value={item.exerciseId}
            aria-invalid={exerciseError ? true : undefined}
            aria-label={`Exercise id for item ${index + 1}`}
            data-testid={`item-${index}-exerciseId`}
            onChange={(e) => update({ exerciseId: e.target.value })}
          />
          {exerciseError && (
            <span className="template-item__error" role="alert" data-testid={`item-${index}-exerciseId-error`}>
              {exerciseError}
            </span>
          )}
        </label>

        {NUMERIC_FIELDS.map((field) => {
          const err = fieldErrors[`${prefix}.${field}`];
          const { min, max } = ITEM_BOUNDS[field];
          return (
            <label className="template-item__field" key={field}>
              <span>{FIELD_LABELS[field]}</span>
              <input
                type="number"
                min={min}
                max={max}
                step={1}
                value={Number.isFinite(item[field]) ? item[field] : ''}
                aria-invalid={err ? true : undefined}
                aria-label={`${FIELD_LABELS[field]} for item ${index + 1}`}
                data-testid={`item-${index}-${field}`}
                onChange={(e) =>
                  update({ [field]: e.target.valueAsNumber } as Partial<TemplateItem>)
                }
              />
              {err && (
                <span
                  className="template-item__error"
                  role="alert"
                  data-testid={`item-${index}-${field}-error`}
                >
                  {err}
                </span>
              )}
            </label>
          );
        })}

        <button
          type="button"
          className="template-item__remove"
          aria-label={`Remove item ${index + 1}`}
          data-testid={`item-${index}-remove`}
          onClick={() => onRemove(index)}
        >
          Remove
        </button>
      </div>
    </fieldset>
  );
}

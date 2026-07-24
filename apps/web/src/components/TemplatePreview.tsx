import type { TemplateDetail, TemplatePreviewItem } from '../types/template';
import './TemplatePreview.css';

export interface TemplatePreviewProps {
  detail: TemplateDetail;
}

/**
 * Human-readable dosage summary for a template item: default sets × reps, plus
 * the hold duration when the movement is hold-based. Rest is omitted here — the
 * preview is about recognising the movement and its intensity at a glance, not
 * editing dosage.
 */
export function formatDosage(item: Pick<TemplatePreviewItem, 'sets' | 'reps' | 'hold'>): string {
  const base = `${item.sets} × ${item.reps}`;
  return item.hold > 0 ? `${base} · hold ${item.hold}s` : base;
}

/**
 * Preview panel for a single expanded template: lists each exercise with its
 * name, thumbnail (falling back to the demo-media reference, then a placeholder),
 * and default dosage. When items were filtered out because their exercise no
 * longer exists, it shows the remaining items plus a subtle "N item unavailable"
 * note rather than failing outright.
 */
export function TemplatePreview({ detail }: TemplatePreviewProps) {
  const unavailable = Math.max(0, detail.itemCount - detail.items.length);

  return (
    <div className="template-preview" data-testid="template-preview">
      <header className="template-preview__header">
        <h3 className="template-preview__name">{detail.name}</h3>
        {detail.description && (
          <p className="template-preview__desc">{detail.description}</p>
        )}
        {detail.categoryTags.length > 0 && (
          <div className="template-preview__tags">
            {detail.categoryTags.map((tag) => (
              <span key={tag} className="template-preview__tag">
                {tag}
              </span>
            ))}
          </div>
        )}
      </header>

      {detail.items.length === 0 ? (
        <p className="template-preview__empty" data-testid="template-preview-empty">
          None of this template’s exercises are available right now.
        </p>
      ) : (
        <ul className="template-preview__items" data-testid="template-preview-items">
          {detail.items.map((item) => {
            const thumb = item.exercise.thumbnailUrl ?? item.exercise.demoMediaRef;
            return (
              <li
                key={item.exerciseId}
                className="template-preview__item"
                data-testid={`template-preview-item-${item.exerciseId}`}
              >
                {thumb ? (
                  <img
                    className="template-preview__thumb"
                    src={thumb}
                    alt=""
                    loading="lazy"
                    data-testid={`template-preview-thumb-${item.exerciseId}`}
                  />
                ) : (
                  <span
                    className="template-preview__thumb template-preview__thumb--empty"
                    aria-hidden
                  />
                )}
                <span className="template-preview__meta">
                  <span className="template-preview__exercise-name">{item.exercise.name}</span>
                  <span
                    className="template-preview__dosage"
                    data-testid={`template-preview-dosage-${item.exerciseId}`}
                  >
                    {formatDosage(item)}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {unavailable > 0 && (
        <p className="template-preview__unavailable" data-testid="template-preview-unavailable">
          {unavailable} item{unavailable === 1 ? '' : 's'} unavailable
        </p>
      )}
    </div>
  );
}

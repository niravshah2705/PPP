import type { PlanDraft, Template } from '../types/template';
import { instantiateDraftFromTemplate } from '../lib/instantiateTemplate';
import './TemplateGallery.css';

export interface TemplateGalleryProps {
  templates: Template[];
  /** Invoked with a fresh plan draft when a doctor instantiates a template. */
  onUse?: (draft: PlanDraft) => void;
  /** Invoked with the template to edit. */
  onEdit?: (template: Template) => void;
}

/**
 * Gallery of curated templates. Newly created templates appear here (the parent
 * refreshes the list after a save) and each card can be instantiated into a
 * plan draft via the template-to-draft flow.
 */
export function TemplateGallery({ templates, onUse, onEdit }: TemplateGalleryProps) {
  if (templates.length === 0) {
    return (
      <p className="template-gallery__empty" data-testid="template-gallery-empty">
        No templates yet. Create one to get started.
      </p>
    );
  }

  return (
    <ul className="template-gallery" data-testid="template-gallery">
      {templates.map((template) => (
        <li key={template.id} className="template-gallery__card" data-testid={`template-card-${template.id}`}>
          <h3 className="template-gallery__name">{template.name}</h3>
          {template.description && (
            <p className="template-gallery__desc">{template.description}</p>
          )}
          <div className="template-gallery__tags">
            {template.categoryTags.map((tag) => (
              <span key={tag} className="template-gallery__tag">
                {tag}
              </span>
            ))}
          </div>
          <p className="template-gallery__count">
            {template.items.length} exercise{template.items.length === 1 ? '' : 's'}
          </p>
          <div className="template-gallery__actions">
            <button
              type="button"
              data-testid={`template-use-${template.id}`}
              onClick={() => onUse?.(instantiateDraftFromTemplate(template))}
            >
              Use template
            </button>
            <button
              type="button"
              data-testid={`template-edit-${template.id}`}
              onClick={() => onEdit?.(template)}
            >
              Edit
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

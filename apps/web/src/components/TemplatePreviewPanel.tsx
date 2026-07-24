import { useTemplateDetail } from '../hooks/useTemplateDetail';
import { TemplatePreview } from './TemplatePreview';
import './TemplatePreview.css';

export interface TemplatePreviewPanelProps {
  /** Id of the selected template to expand, or undefined when nothing is picked. */
  templateId?: string;
}

/**
 * Fetching wrapper around {@link TemplatePreview}. Loads the selected template's
 * expanded items via `GET /api/templates/:id` and renders clear loading,
 * error-with-retry, and not-found states so the doctor is never stuck on a blank
 * panel. When nothing is selected it shows a gentle prompt to pick a template.
 */
export function TemplatePreviewPanel({ templateId }: TemplatePreviewPanelProps) {
  const { status, detail, error, retry } = useTemplateDetail(templateId);

  if (!templateId) {
    return (
      <aside className="template-preview-panel" data-testid="template-preview-panel">
        <p className="template-preview-panel__idle" data-testid="template-preview-idle">
          Select a template to preview its exercises.
        </p>
      </aside>
    );
  }

  return (
    <aside className="template-preview-panel" data-testid="template-preview-panel">
      {status === 'loading' && (
        <p
          className="template-preview-panel__status"
          role="status"
          data-testid="template-preview-loading"
        >
          <span className="template-preview-panel__spinner" aria-hidden />
          Loading preview…
        </p>
      )}

      {status === 'not-found' && (
        <p
          className="template-preview-panel__status"
          role="alert"
          data-testid="template-preview-not-found"
        >
          This template could not be found.
        </p>
      )}

      {status === 'error' && (
        <div
          className="template-preview-panel__error"
          role="alert"
          data-testid="template-preview-error"
        >
          <span>{error ? `Couldn’t load preview: ${error}` : 'Couldn’t load preview.'}</span>
          <button
            type="button"
            className="template-preview-panel__retry"
            data-testid="template-preview-retry"
            onClick={retry}
          >
            Retry
          </button>
        </div>
      )}

      {status === 'ready' && detail && <TemplatePreview detail={detail} />}
    </aside>
  );
}

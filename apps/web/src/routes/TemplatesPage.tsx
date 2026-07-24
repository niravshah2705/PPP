import { useCallback, useEffect, useState } from 'react';
import type { PlanDraft, Template } from '../types/template';
import { listTemplates } from '../api/templates';
import { TemplateEditor } from '../components/TemplateEditor';
import { TemplateGallery } from '../components/TemplateGallery';

type Mode = { kind: 'gallery' } | { kind: 'create' } | { kind: 'edit'; template: Template };

/**
 * Template management page at `/doctor/templates`. Shows the gallery, lets the
 * doctor create a new template or edit an existing one, and refreshes the
 * gallery after a save so new/updated templates appear immediately. "Use
 * template" instantiates a plan draft via the template-to-draft flow.
 */
export function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [mode, setMode] = useState<Mode>({ kind: 'gallery' });
  const [draft, setDraft] = useState<PlanDraft | undefined>();

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setStatus('loading');
    try {
      const list = await listTemplates(signal);
      if (signal?.aborted) return;
      setTemplates(list);
      setStatus('ready');
    } catch {
      if (signal?.aborted) return;
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  const handleSaved = async (saved: Template) => {
    await refresh();
    setMode({ kind: 'gallery' });
    // Keep focus context: surface the just-saved template name in the heading.
    setTemplates((prev) =>
      prev.some((t) => t.id === saved.id) ? prev : [...prev, saved],
    );
  };

  return (
    <section className="templates-page">
      <header className="templates-page__header">
        <h1>Templates</h1>
        {mode.kind === 'gallery' && (
          <button type="button" data-testid="new-template" onClick={() => setMode({ kind: 'create' })}>
            New template
          </button>
        )}
        {mode.kind !== 'gallery' && (
          <button type="button" data-testid="cancel-edit" onClick={() => setMode({ kind: 'gallery' })}>
            Back to gallery
          </button>
        )}
      </header>

      {mode.kind === 'gallery' && (
        <>
          {status === 'loading' && <p data-testid="templates-loading">Loading templates…</p>}
          {status === 'error' && (
            <p role="alert" data-testid="templates-error">
              Failed to load templates.
            </p>
          )}
          {status === 'ready' && (
            <TemplateGallery
              templates={templates}
              onUse={setDraft}
              onEdit={(template) => setMode({ kind: 'edit', template })}
            />
          )}
          {draft && (
            <p data-testid="instantiated-draft">
              Started a plan draft from “{draft.name}” with {draft.items.length} exercise
              {draft.items.length === 1 ? '' : 's'}.
            </p>
          )}
        </>
      )}

      {mode.kind === 'create' && <TemplateEditor onSaved={handleSaved} />}
      {mode.kind === 'edit' && (
        <TemplateEditor template={mode.template} onSaved={handleSaved} />
      )}
    </section>
  );
}

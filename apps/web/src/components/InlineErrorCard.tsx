import './InlineErrorCard.css';

export interface InlineErrorCardProps {
  title: string;
  message: string;
}

/**
 * Compact, self-contained error card. Sized to sit inside an embed/iframe so an
 * invalid exercise id renders a clear message instead of a blank page.
 */
export function InlineErrorCard({ title, message }: InlineErrorCardProps) {
  return (
    <div className="inline-error-card" role="alert" data-testid="inline-error-card">
      <span className="inline-error-card__icon" aria-hidden="true">
        !
      </span>
      <div className="inline-error-card__body">
        <strong className="inline-error-card__title">{title}</strong>
        <span className="inline-error-card__message">{message}</span>
      </div>
    </div>
  );
}

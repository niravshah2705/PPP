import { PatientContextSelector } from './PatientContextSelector';
import './AppHeader.css';

/**
 * Global app chrome. Hosts the {@link PatientContextSelector} so the doctor sets
 * the working patient once, up front, and every downstream builder action reads
 * it from shared context. Rendered on all chrome-bearing routes (the embed route
 * opts out so iframes stay bare).
 */
export function AppHeader() {
  return (
    <header className="app-header" data-testid="app-header">
      <span className="app-header__brand">PPP</span>
      <PatientContextSelector />
    </header>
  );
}

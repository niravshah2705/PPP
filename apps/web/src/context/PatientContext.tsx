import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { normalizePatientName } from '../lib/patientSuggestions';

/** The query-string key the selected patient persists under (`?patient=`). */
export const PATIENT_QUERY_PARAM = 'patient';

export interface PatientContextValue {
  /** Raw patient name exactly as typed/selected (may include surrounding space). */
  patientName: string;
  /** Trimmed patient name, or `''` when nothing usable is set. */
  patient: string;
  /** True only when a non-empty, non-whitespace patient is set. */
  hasPatient: boolean;
  /** Set (or clear, with an empty string) the current patient. */
  setPatientName: (name: string) => void;
  /**
   * Whether an unsaved builder draft is in progress. Builders raise this while
   * editing and lower it once saved/discarded so the selector can warn before a
   * patient change silently drops the draft's context.
   */
  draftDirty: boolean;
  setDraftDirty: (dirty: boolean) => void;
}

const PatientCtx = createContext<PatientContextValue | null>(null);

/**
 * Holds the current patient the doctor is building for and keeps it in the URL
 * query (`?patient=`) so a refresh restores it. The value lives in React state
 * (surviving client-side route changes) and is mirrored into the URL of the
 * active location, so the choice follows the doctor across the app and across a
 * hard reload — the foundational context every downstream builder action reads.
 */
export function PatientProvider({ children }: { children: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();
  // Seed once from the URL so a deep link / refresh restores the patient.
  const [patientName, setPatientNameState] = useState(
    () => searchParams.get(PATIENT_QUERY_PARAM) ?? '',
  );
  const [draftDirty, setDraftDirty] = useState(false);

  // Mirror state into the URL. Runs on both state changes and navigations, so a
  // route change (which drops the query) re-applies the current patient and a
  // refresh can read it back. Replace-mode keeps typing out of history.
  useEffect(() => {
    const current = searchParams.get(PATIENT_QUERY_PARAM) ?? '';
    if (current === patientName) return;
    const next = new URLSearchParams(searchParams);
    if (patientName) {
      next.set(PATIENT_QUERY_PARAM, patientName);
    } else {
      next.delete(PATIENT_QUERY_PARAM);
    }
    setSearchParams(next, { replace: true });
  }, [patientName, searchParams, setSearchParams]);

  const setPatientName = useCallback((name: string) => setPatientNameState(name), []);

  const value = useMemo<PatientContextValue>(() => {
    const patient = normalizePatientName(patientName) ?? '';
    return {
      patientName,
      patient,
      hasPatient: patient.length > 0,
      setPatientName,
      draftDirty,
      setDraftDirty,
    };
  }, [patientName, setPatientName, draftDirty]);

  return <PatientCtx.Provider value={value}>{children}</PatientCtx.Provider>;
}

/** Read the patient context; throws if used outside a {@link PatientProvider}. */
export function usePatientContext(): PatientContextValue {
  const ctx = useContext(PatientCtx);
  if (!ctx) {
    throw new Error('usePatientContext must be used within a PatientProvider');
  }
  return ctx;
}

/**
 * Read the patient context when present, or `null` when no provider is mounted.
 * Lets a component (e.g. the plan builder) integrate with the shared selector in
 * the app while remaining usable standalone (tests, embeds) without one.
 */
export function usePatientContextOptional(): PatientContextValue | null {
  return useContext(PatientCtx);
}

import { useEffect, useRef, useState } from 'react';
import { usePatientContext } from '../context/PatientContext';
import { usePatientSuggestions } from '../hooks/usePatientSuggestions';
import { filterPatientSuggestions } from '../lib/patientSuggestions';
import './PatientContextSelector.css';

/**
 * Header control for choosing the patient a plan is built for. The doctor types
 * or selects a name; it persists in shared app state and the URL (`?patient=`)
 * so a refresh or route change keeps the context. A typeahead surfaces
 * previously-used patients (distinct names from `GET /api/plans?patientName=`).
 *
 * Changing the patient while an unsaved draft is in progress is guarded: instead
 * of silently swapping context, it prompts the doctor to confirm or cancel, so
 * in-progress work is never lost without a heads-up.
 */
export function PatientContextSelector() {
  const { patientName, patient, hasPatient, setPatientName, draftDirty } = usePatientContext();
  const [input, setInput] = useState(patientName);
  const [focused, setFocused] = useState(false);
  // A pending patient awaiting confirm/cancel because a draft is mid-flight.
  const [pending, setPending] = useState<string | null>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout>>();

  // Reflect external changes (route restore, confirmed change) into the field.
  useEffect(() => setInput(patientName), [patientName]);
  useEffect(() => () => clearTimeout(blurTimer.current), []);

  const allSuggestions = usePatientSuggestions(input);
  const suggestions = filterPatientSuggestions(allSuggestions, input);

  // When a draft is dirty and a patient is already set, editing the field must
  // not silently replace the committed patient — buffer locally and only commit
  // (with a prompt) on an explicit action.
  const guarded = draftDirty && hasPatient;

  const commit = (name: string) => {
    setInput(name);
    const nextTrim = name.trim();
    if (guarded && nextTrim.toLowerCase() !== patient.toLowerCase()) {
      setPending(name);
      return;
    }
    setPatientName(name);
  };

  const handleChange = (value: string) => {
    setInput(value);
    // Persist live while it's safe; buffer when a change would drop draft context.
    if (!guarded) setPatientName(value);
  };

  const handleConfirm = () => {
    if (pending !== null) setPatientName(pending);
    setPending(null);
  };

  const handleCancel = () => {
    setPending(null);
    setInput(patientName);
  };

  const showList = focused && pending === null && suggestions.length > 0;

  return (
    <div className="patient-selector" data-testid="patient-selector">
      <label className="patient-selector__field">
        <span className="patient-selector__label">Patient</span>
        <input
          type="text"
          className="patient-selector__input"
          data-testid="patient-selector-input"
          aria-label="Patient name"
          role="combobox"
          aria-expanded={showList}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder="Type or choose a patient"
          value={input}
          onChange={(event) => handleChange(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            // Delay so a suggestion mousedown/click registers before we close.
            blurTimer.current = setTimeout(() => setFocused(false), 120);
            commit(input);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit(input);
              setFocused(false);
            }
          }}
        />
      </label>

      {showList && (
        <ul className="patient-selector__suggestions" data-testid="patient-selector-suggestions">
          {suggestions.map((name, index) => (
            <li key={name} className="patient-selector__suggestion-item">
              <button
                type="button"
                className="patient-selector__suggestion"
                data-testid={`patient-suggestion-${index}`}
                // Commit before the input's blur-close fires.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  commit(name);
                  setFocused(false);
                }}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {pending !== null && (
        <div
          className="patient-selector__prompt"
          role="alertdialog"
          aria-label="Confirm patient change"
          data-testid="patient-change-prompt"
        >
          <p className="patient-selector__prompt-text">
            Change patient from <strong>{patient}</strong> to{' '}
            <strong>{pending.trim() || '(none)'}</strong>? Your unsaved draft context may be lost.
          </p>
          <div className="patient-selector__prompt-actions">
            <button
              type="button"
              className="patient-selector__prompt-confirm"
              data-testid="patient-change-confirm"
              onClick={handleConfirm}
            >
              Change patient
            </button>
            <button
              type="button"
              className="patient-selector__prompt-cancel"
              data-testid="patient-change-cancel"
              onClick={handleCancel}
            >
              Keep {patient}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

import { Navigate, Route, Routes } from 'react-router-dom';
import { EmbedExercise } from './routes/EmbedExercise';
import { ExercisePlayer } from './routes/ExercisePlayer';
import { DoctorPreviewPage } from './routes/DoctorPreviewPage';
import { DoctorSessionReviewPage } from './routes/DoctorSessionReviewPage';
import { TemplatesPage } from './routes/TemplatesPage';
import { PlansPage } from './routes/PlansPage';
import { PatientPlanPage } from './routes/PatientPlanPage';

export function App() {
  return (
    <Routes>
      {/* Tracking-free, chrome-free demo scene for iframe embedding. */}
      <Route path="/embed/exercise/:id" element={<EmbedExercise />} />
      {/* Full session player (reuses the same scene component). */}
      <Route path="/exercise/:id" element={<ExercisePlayer />} />
      {/* Patient plan player: start/resume a session and record results as the patient progresses. */}
      <Route path="/patient" element={<PatientPlanPage />} />
      {/* Doctor template preview embeds the demo route via iframe. */}
      <Route path="/doctor/preview/:id" element={<DoctorPreviewPage />} />
      {/* Doctor session-review dashboard for a plan. */}
      <Route path="/doctor/sessions/:planId" element={<DoctorSessionReviewPage />} />
      {/* Template management: create/edit custom templates and instantiate them. */}
      <Route path="/doctor/templates" element={<TemplatesPage />} />
      {/* Plan management: list/search all plans; open, copy link, or duplicate. */}
      <Route path="/doctor/plans" element={<PlansPage />} />
      <Route path="*" element={<Navigate to="/embed/exercise/demo" replace />} />
    </Routes>
  );
}

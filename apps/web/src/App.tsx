import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { EmbedExercise } from './routes/EmbedExercise';
import { ExercisePlayer } from './routes/ExercisePlayer';
import { DoctorPreviewPage } from './routes/DoctorPreviewPage';
import { DoctorSessionReviewPage } from './routes/DoctorSessionReviewPage';
import { TemplatesPage } from './routes/TemplatesPage';
import { PlansPage } from './routes/PlansPage';
import { PatientProvider } from './context/PatientContext';
import { AppHeader } from './components/AppHeader';

/** Chrome-free routes (iframe embeds) opt out of the global header. */
function isBareRoute(pathname: string): boolean {
  return pathname.startsWith('/embed/');
}

export function App() {
  // The patient context lives above the routes so the doctor's chosen patient
  // persists across route changes (and the URL keeps it across a refresh).
  return (
    <PatientProvider>
      <AppShell />
    </PatientProvider>
  );
}

function AppShell() {
  const { pathname } = useLocation();
  return (
    <>
      {!isBareRoute(pathname) && <AppHeader />}
      <Routes>
        {/* Tracking-free, chrome-free demo scene for iframe embedding. */}
        <Route path="/embed/exercise/:id" element={<EmbedExercise />} />
        {/* Full session player (reuses the same scene component). */}
        <Route path="/exercise/:id" element={<ExercisePlayer />} />
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
    </>
  );
}

import { Navigate, Route, Routes } from 'react-router-dom';
import { EmbedExercise } from './routes/EmbedExercise';
import { ExercisePlayer } from './routes/ExercisePlayer';
import { DoctorPreviewPage } from './routes/DoctorPreviewPage';
import { TemplatesPage } from './routes/TemplatesPage';

export function App() {
  return (
    <Routes>
      {/* Tracking-free, chrome-free demo scene for iframe embedding. */}
      <Route path="/embed/exercise/:id" element={<EmbedExercise />} />
      {/* Full session player (reuses the same scene component). */}
      <Route path="/exercise/:id" element={<ExercisePlayer />} />
      {/* Doctor template preview embeds the demo route via iframe. */}
      <Route path="/doctor/preview/:id" element={<DoctorPreviewPage />} />
      {/* Template management: create/edit custom templates and instantiate them. */}
      <Route path="/doctor/templates" element={<TemplatesPage />} />
      <Route path="*" element={<Navigate to="/embed/exercise/demo" replace />} />
    </Routes>
  );
}

import type { Exercise } from '../../types/exercise';

/**
 * Seeded exercise library.
 *
 * This is the read-only catalogue the template read handlers join against when
 * expanding a template's items into preview items (name + demo media). Plan
 * template fixtures may only reference ids that appear here — enforced by the
 * integrity check in `templateIntegrity.ts` and its test.
 *
 * Each entry carries a `demoMediaRef` so an expanded template item can render
 * media without a second lookup.
 */
export const EXERCISE_CATALOG: readonly Exercise[] = [
  // --- Knee ---
  {
    id: 'knee-flexion',
    name: 'Seated Knee Flexion',
    description: 'Bend the knee, sliding the heel back under the chair.',
    category: 'knee',
    accentColor: '#4f46e5',
    demoMediaRef: 'media/knee-flexion.mp4',
    thumbnailUrl: '/thumbs/knee-flexion.png',
  },
  {
    id: 'knee-extension',
    name: 'Seated Knee Extension',
    description: 'Straighten the knee against gentle resistance.',
    category: 'knee',
    accentColor: '#4f46e5',
    demoMediaRef: 'media/knee-extension.mp4',
    thumbnailUrl: '/thumbs/knee-extension.png',
  },
  {
    id: 'quad-set',
    name: 'Quad Set',
    description: 'Tighten the thigh, pressing the back of the knee down.',
    category: 'knee',
    accentColor: '#4f46e5',
    demoMediaRef: 'media/quad-set.mp4',
  },
  {
    id: 'heel-slide',
    name: 'Heel Slide',
    description: 'Slide the heel toward the buttock and back, lying down.',
    category: 'knee',
    accentColor: '#4f46e5',
    demoMediaRef: 'media/heel-slide.mp4',
  },
  {
    id: 'straight-leg-raise',
    name: 'Straight-Leg Raise',
    description: 'Lift the straightened leg with the quad engaged.',
    category: 'knee',
    accentColor: '#4f46e5',
    demoMediaRef: 'media/straight-leg-raise.mp4',
  },

  // --- Shoulder ---
  {
    id: 'shoulder-pendulum',
    name: 'Pendulum Swing',
    description: 'Let the arm hang and swing gently in small circles.',
    category: 'shoulder',
    accentColor: '#0ea5e9',
    demoMediaRef: 'media/shoulder-pendulum.mp4',
    thumbnailUrl: '/thumbs/shoulder-pendulum.png',
  },
  {
    id: 'shoulder-external-rotation',
    name: 'External Rotation',
    description: 'Rotate the forearm outward keeping the elbow tucked.',
    category: 'shoulder',
    accentColor: '#0ea5e9',
    demoMediaRef: 'media/shoulder-external-rotation.mp4',
  },
  {
    id: 'wall-slide',
    name: 'Wall Slide',
    description: 'Slide the forearms up a wall keeping contact.',
    category: 'shoulder',
    accentColor: '#0ea5e9',
    demoMediaRef: 'media/wall-slide.mp4',
  },
  {
    id: 'scapular-retraction',
    name: 'Scapular Retraction',
    description: 'Squeeze the shoulder blades together and hold.',
    category: 'shoulder',
    accentColor: '#0ea5e9',
    demoMediaRef: 'media/scapular-retraction.mp4',
  },

  // --- Lower-back / core ---
  {
    id: 'pelvic-tilt',
    name: 'Pelvic Tilt',
    description: 'Flatten the lower back by tilting the pelvis.',
    category: 'lower-back',
    accentColor: '#f59e0b',
    demoMediaRef: 'media/pelvic-tilt.mp4',
  },
  {
    id: 'bird-dog',
    name: 'Bird Dog',
    description: 'Extend the opposite arm and leg from all fours; hold.',
    category: 'lower-back',
    accentColor: '#f59e0b',
    demoMediaRef: 'media/bird-dog.mp4',
    thumbnailUrl: '/thumbs/bird-dog.png',
  },
  {
    id: 'dead-bug',
    name: 'Dead Bug',
    description: 'Lower the opposite arm and leg while bracing the core.',
    category: 'lower-back',
    accentColor: '#f59e0b',
    demoMediaRef: 'media/dead-bug.mp4',
  },
  {
    id: 'glute-bridge',
    name: 'Glute Bridge',
    description: 'Lift the hips into a bridge and hold.',
    category: 'lower-back',
    accentColor: '#f59e0b',
    demoMediaRef: 'media/glute-bridge.mp4',
  },

  // --- Balance / general ---
  {
    id: 'single-leg-stance',
    name: 'Single-Leg Stance',
    description: 'Balance on one leg with light fingertip support as needed.',
    category: 'balance',
    accentColor: '#10b981',
    demoMediaRef: 'media/single-leg-stance.mp4',
    thumbnailUrl: '/thumbs/single-leg-stance.png',
  },
  {
    id: 'tandem-stance',
    name: 'Tandem Stance',
    description: 'Stand heel-to-toe and hold steady.',
    category: 'balance',
    accentColor: '#10b981',
    demoMediaRef: 'media/tandem-stance.mp4',
  },
  {
    id: 'heel-toe-walk',
    name: 'Heel-to-Toe Walk',
    description: 'Walk in a straight line placing heel against toe.',
    category: 'balance',
    accentColor: '#10b981',
    demoMediaRef: 'media/heel-toe-walk.mp4',
  },
  {
    id: 'marching-in-place',
    name: 'Marching in Place',
    description: 'March lifting the knees to a comfortable height.',
    category: 'balance',
    accentColor: '#10b981',
    demoMediaRef: 'media/marching-in-place.mp4',
  },
];

/** Index the catalogue by id for O(1) joins during template expansion. */
export function indexExercisesById(
  exercises: readonly Exercise[] = EXERCISE_CATALOG,
): Map<string, Exercise> {
  const index = new Map<string, Exercise>();
  for (const exercise of exercises) index.set(exercise.id, exercise);
  return index;
}

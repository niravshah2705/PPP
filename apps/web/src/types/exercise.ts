/** A rehabilitation exercise and the metadata needed to render its 3D demo. */
export interface Exercise {
  id: string;
  name: string;
  /** Short human-readable description shown in player chrome (not in embed). */
  description?: string;
  /** Identifier/URL of the demo animation clip driving the looping 3D scene. */
  demoClip?: string;
  /** Accent colour (hex) used by the demo scene, e.g. "#4f46e5". */
  accentColor?: string;
  /**
   * Category the exercise belongs to (e.g. "knee", "shoulder"). Used to group
   * and filter the library in the add-exercise picker and rendered as a tag.
   */
  category?: string;
  /** URL of a small preview image shown alongside the exercise in the picker. */
  thumbnailUrl?: string;
}

/** Min length for tracker/device name when provided (optional name can be empty). */
export const TRACKER_NAME_MIN = 1;
/** Max length for tracker/device name. */
export const TRACKER_NAME_MAX = 32;

export function validateTrackerName(name: string | null | undefined): { valid: boolean; error?: string } {
  if (name == null || name === '') return { valid: true };
  const trimmed = name.trim();
  if (trimmed.length === 0) return { valid: true };
  if (trimmed.length < TRACKER_NAME_MIN) return { valid: false, error: `Name must be at least ${TRACKER_NAME_MIN} character or empty` };
  if (trimmed.length > TRACKER_NAME_MAX) return { valid: false, error: `Name must be ${TRACKER_NAME_MAX} characters or fewer` };
  return { valid: true };
}

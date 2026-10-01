/**
 * Where feedback goes. Kept in one place so the address can be swapped for an
 * alias later without hunting through the help text.
 */
export const FEEDBACK_EMAIL = 'ellen.yard@gmail.com';

export const FEEDBACK_MAILTO = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent('LineList feedback')}`;

/** Asked of everyone who writes in: a bug report is not worth a disclosure. */
export const FEEDBACK_PRIVACY_NOTE =
  "Please don't send datasets or screenshots that contain identifiable information.";

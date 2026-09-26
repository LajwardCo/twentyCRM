// Public submission body cap; answers are further capped per field by the
// shared engine.
export const SURVEY_MAX_SUBMISSION_BYTES = 256 * 1024;

export const SURVEY_MAX_DRAFT_DEFINITION_BYTES = 1024 * 1024;

// Bots that submit faster than a person can read the first question are
// stored as spam instead of rejected, so they learn nothing.
export const SURVEY_MIN_FILL_MILLISECONDS = 3000;

// Afghan mobile carriers put many subscribers behind one address (CGNAT), so
// per-address limits must allow a busy shop or office, not one person.
export const SURVEY_SUBMIT_RATE_LIMIT_PER_IP = {
  maxTokens: 20,
  windowMs: 10 * 60 * 1000,
};

export const SURVEY_SUBMIT_RATE_LIMIT_PER_IP_ANY_FORM = {
  maxTokens: 60,
  windowMs: 10 * 60 * 1000,
};

export const SURVEY_SUBMIT_RATE_LIMIT_PER_FORM = {
  maxTokens: 120,
  windowMs: 60 * 1000,
};

export const SURVEY_READ_RATE_LIMIT_PER_IP = {
  maxTokens: 60,
  windowMs: 60 * 1000,
};

export const SURVEY_UPLOAD_RATE_LIMIT_PER_IP = {
  maxTokens: 20,
  windowMs: 10 * 60 * 1000,
};

export const SURVEY_UPLOAD_REF_TTL_MS = 60 * 60 * 1000;

export const SURVEY_MAX_INVITATIONS_PER_REQUEST = 200;

export const SURVEY_PUBLIC_ACTOR_NAME = 'فرم آنلاین';

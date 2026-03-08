/**
 * Support ticket system – constants and limits.
 */

export const SUPPORT_ATTACHMENT_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const SUPPORT_ATTACHMENT_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/json',
] as const;

export const SUPPORT_REOPEN_WINDOW_HOURS_DEFAULT = 168; // 7 days

/** Max length for ticket subject (characters). */
export const SUPPORT_TICKET_SUBJECT_MAX_LENGTH = 200;
/** Max length for ticket description / first message (characters). */
export const SUPPORT_TICKET_DESCRIPTION_MAX_LENGTH = 5000;

export const SUPPORT_TICKET_LIST_PAGE_SIZE = 20;
export const SUPPORT_MESSAGE_PAGE_SIZE = 50;

export const SUPPORT_STORAGE_BUCKET = 'support-attachments';

export interface SurveySendErrorBody {
  apiVersion?: string;
  requestId?: string;
  error?: {
    code?: string;
    message?: string;
    retryable?: boolean;
    fields?: { field: string; code: string }[];
  };
}

export type SurveySendFailure =
  | { kind: 'halt'; code: string; message: string }
  | { kind: 'retry'; delaySeconds: number; message: string };

const HALT_MESSAGES: Record<string, string> = {
  VALIDATION_FAILED:
    'GetMyOpinion rejected the request as invalid. Fix the mapped fields and run the Zap again.',
  SERVICE_UNKNOWN:
    'Unknown service code. Use the exact activity key configured for this centre in GetMyOpinion (not the numeric ID).',
  ACTIVITY_INCOMPATIBLE:
    "The service code does not match this centre's industry. Check the activity key in GetMyOpinion.",
  ACTIVITY_DISABLED:
    'This service is disabled for the centre. Enable it in GetMyOpinion or use another service code.',
  ACTIVE_TEMPLATE_MISSING:
    'No active survey template is configured for this centre and service. The account owner must configure one in GetMyOpinion.',
  SURVEYS_NOT_ENABLED:
    'Surveys are not enabled on this GetMyOpinion account. The account owner must enable them.',
  SMS_NOT_ENABLED:
    'SMS is not enabled on this GetMyOpinion account and no email was provided. Add an email or ask the account owner to enable SMS.',
  SURVEY_QUOTA_EXCEEDED:
    'Survey quota exhausted on this GetMyOpinion account. The account owner must upgrade or wait for the quota to reset.',
  IDEMPOTENCY_PAYLOAD_MISMATCH:
    'This external event ID was already accepted with different data. Reuse an external event ID only for the identical service event.',
  PENDING_SURVEY_CONFLICT:
    'A pending survey already exists for this customer. Do not create a new external event ID for the same service event.',
  SURVEY_ALREADY_EXISTS:
    'A survey already exists for this customer, service and time. Keep the same external event ID and do not send a duplicate.',
  CUSTOMER_CONTACT_CONFLICT:
    'The email and phone match different existing customers. Nothing was created; contact GetMyOpinion support.',
  EVENT_EXPIRED:
    'This external event is older than the 90-day retention window and can no longer be sent. Do not reuse the ID.',
  CONFIGURATION_ERROR:
    'GetMyOpinion reported a configuration error for this centre. Contact the account owner or GetMyOpinion support.',
};

const RETRY_MESSAGES: Record<string, string> = {
  REQUEST_IN_PROGRESS: 'The same event is still being processed.',
  AUTH_UNAVAILABLE: 'GetMyOpinion auth is temporarily unavailable.',
  ADMISSION_UNAVAILABLE: 'GetMyOpinion is temporarily unavailable.',
  INTERNAL_ERROR:
    'GetMyOpinion reported an internal error; the outcome may be unknown.',
};

const UNKNOWN_5XX_MESSAGE = 'GetMyOpinion returned an unexpected server error.';

const GENERIC_AUTH_MESSAGE =
  'Authentication rejected: check the public key and secret.';
const CLOCK_SKEW_MESSAGE =
  'Clock skew with the GetMyOpinion server: try again, and reconnect if the error persists.';

const retryDelay = (retryAfterHeader: string | null): number => {
  const parsed = Number.parseInt(retryAfterHeader ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 2 ? parsed : 2;
};

/**
 * Maps a failed POST /survey-sends response to either an actionable error
 * (halt) or a scheduled retry, per contract 1.0.0 §6. Retries always keep the
 * external event ID — never generate a new one to work around a conflict.
 * `retrySuffix` is appended to retry messages so each platform can state its
 * own retry semantics; an empty suffix leaves the base message untouched.
 */
export function classifySurveySendFailure(
  status: number,
  body: SurveySendErrorBody | undefined,
  retryAfterHeader: string | null,
  retrySuffix = '',
): SurveySendFailure {
  const code = body?.error?.code ?? 'UNKNOWN';
  const fieldDetail = (body?.error?.fields ?? [])
    .map((field) => `${field.field}: ${field.code}`)
    .join(', ');

  // Configuration 503s are not transient (§6).
  if (code === 'CONFIGURATION_ERROR') {
    return { kind: 'halt', code, message: HALT_MESSAGES[code]! };
  }

  if (status >= 500 || code in RETRY_MESSAGES) {
    const base =
      code in RETRY_MESSAGES ? RETRY_MESSAGES[code]! : UNKNOWN_5XX_MESSAGE;
    return {
      kind: 'retry',
      delaySeconds: retryDelay(retryAfterHeader),
      message: `${base} ${retrySuffix}`.trim(),
    };
  }

  const base =
    HALT_MESSAGES[code] ?? `GetMyOpinion rejected the request (${code}).`;
  const message = fieldDetail ? `${base} Fields: ${fieldDetail}.` : base;

  return { kind: 'halt', code, message };
}

// Contract 1.0.0 §6: the server hides key state behind a generic 401, so the
// client surfaces one generic message for it. Timestamp 401s are the exception:
// §3 says the fix is clock correction, not reconnecting with new credentials.
export function classifyAuthFailure(body: SurveySendErrorBody | undefined): {
  message: string;
  clockSkew: boolean;
} {
  const code = body?.error?.code;

  if (
    code === 'AUTH_TIMESTAMP_MALFORMED' ||
    code === 'AUTH_TIMESTAMP_OUT_OF_WINDOW'
  ) {
    return { message: CLOCK_SKEW_MESSAGE, clockSkew: true };
  }

  return { message: GENERIC_AUTH_MESSAGE, clockSkew: false };
}

export const GMO_API_BASE_URL_VAR = 'GMO_API_BASE_URL';

export const ME_PATH = '/api/v1.0/me';

export const SURVEY_SENDS_PATH = '/api/v1.0/survey-sends';

export const PRODUCTION_ORIGIN = 'https://www.getmyopinion.eu';

export function resolveBaseUrl(hints?: {
  missingEnvHint?: string;
  defaultOrigin?: string;
}): string {
  const base = process.env[GMO_API_BASE_URL_VAR];

  if (!base) {
    if (hints?.defaultOrigin) {
      return hints.defaultOrigin;
    }

    throw new Error(
      `${GMO_API_BASE_URL_VAR} is not configured for this environment.${hints?.missingEnvHint ?? ''}`,
    );
  }

  return base.replace(/\/+$/, '');
}

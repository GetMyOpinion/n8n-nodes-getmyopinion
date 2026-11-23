export const GMO_API_BASE_URL_VAR = 'GMO_API_BASE_URL';

export const ME_PATH = '/api/v1.0/me';

export const SURVEY_SENDS_PATH = '/api/v1.0/survey-sends';

export const PRODUCTION_ORIGIN = 'https://www.getmyopinion.eu';

export function resolveBaseUrl(hints?: {
  missingEnvHint?: string;
  defaultOrigin?: string;
}): string {
  // globalThis.process (not the bare `process` identifier): n8n's
  // community-package linter forbids the restricted global in shipped code,
  // and the optional chain degrades to the default/hint path if a sandbox
  // ever omits it. Same object in every current runtime.
  const base = globalThis.process?.env?.[GMO_API_BASE_URL_VAR];

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

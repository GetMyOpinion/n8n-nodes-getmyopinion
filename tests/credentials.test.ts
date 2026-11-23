import {
  ME_PATH,
  PRODUCTION_ORIGIN,
  SURVEY_SENDS_PATH,
  buildGmoAuthHeaders,
} from '../src/core/index.js';
import type { IHttpRequestOptions } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';

import { GetMyOpinionApi } from '../credentials/GetMyOpinionApi.credentials';

const credential = new GetMyOpinionApi();

const auth = {
  keyId: 'pk_n8n_test_5f3a',
  secret: 'synthetic-secret-for-n8n-credential-tests',
};

async function authenticate(options: IHttpRequestOptions) {
  const { authenticate: fn } = credential;

  if (typeof fn !== 'function') {
    throw new Error('authenticate must be declared in function form');
  }

  return fn({ keyId: auth.keyId, secret: auth.secret }, options);
}

function sentTimestamp(options: IHttpRequestOptions) {
  const timestamp = options.headers?.['x-timestamp'];
  expect(timestamp).toBeTypeOf('string');
  return timestamp as string;
}

describe('GetMyOpinionApi credential', () => {
  it('signs the exact POST body string and adds the JSON content type', async () => {
    const body = JSON.stringify({
      surveyId: 'svy_2KxmQp',
      recipientEmail: 'anne@example.com',
    });

    const result = await authenticate({
      method: 'POST',
      url: `${PRODUCTION_ORIGIN}${SURVEY_SENDS_PATH}`,
      body,
      headers: {},
    });

    const expected = buildGmoAuthHeaders(
      'POST',
      SURVEY_SENDS_PATH,
      body,
      auth,
      sentTimestamp(result),
    );

    expect(result.headers).toEqual({
      ...expected,
      'Content-Type': 'application/json',
    });
  });

  it('signs the empty string for a GET without a body and adds no content type', async () => {
    const result = await authenticate({
      method: 'GET',
      url: `${PRODUCTION_ORIGIN}${ME_PATH}`,
      body: undefined,
      headers: {},
    });

    const expected = buildGmoAuthHeaders(
      'GET',
      ME_PATH,
      '',
      auth,
      sentTimestamp(result),
    );

    expect(result.headers).toEqual(expected);
    expect(result.headers).not.toHaveProperty('Content-Type');
  });

  it('rejects a URL carrying a query string before signing', async () => {
    await expect(
      authenticate({
        method: 'GET',
        url: `${PRODUCTION_ORIGIN}${ME_PATH}?x=1`,
        headers: {},
      }),
    ).rejects.toThrow(/query/i);
  });

  it('returns the request options with method, url and body untouched', async () => {
    const body = '{"surveyId":"svy_9Wq4"}';

    const result = await authenticate({
      method: 'POST',
      url: `${PRODUCTION_ORIGIN}${SURVEY_SENDS_PATH}`,
      body,
      headers: { 'X-Existing': 'kept' },
    });

    expect(result.method).toBe('POST');
    expect(result.url).toBe(`${PRODUCTION_ORIGIN}${SURVEY_SENDS_PATH}`);
    expect(result.body).toBe(body);
    expect(result.headers?.['X-Existing']).toBe('kept');
  });
});

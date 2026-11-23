import {
  PRODUCTION_ORIGIN,
  SURVEY_SEND_FIELDS,
  SURVEY_SENDS_PATH,
  buildSurveySendPayload,
} from '../src/core/index.js';
import type { SurveySendInput } from '../src/core/index.js';
import { NodeApiError } from 'n8n-workflow';
import type {
  IExecuteFunctions,
  IHttpRequestOptions,
  INode,
  INodeExecutionData,
} from 'n8n-workflow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GetMyOpinion, N8N_RETRY_SUFFIX } from '../nodes/GetMyOpinion/N8n-nodes-getmyopinion.node';

import { readFileSync } from 'node:fs';

const ENV_VAR = 'GMO_API_BASE_URL';

const sampleInput: SurveySendInput = {
  firstName: 'Alice',
  lastName: 'Exemple',
  email: 'alice@example.invalid',
  phone: '',
  serviceCode: 'fixture-service',
  serviceDate: '2026-11-02T10:00:00Z',
  externalEventId: 'crm:appointment-0001',
};

const sampleItem: INodeExecutionData = {
  json: { ...sampleInput },
};

// Frozen `accepted` scenario body (fixtures/scenarios.json cases[0].response).
const acceptedBody = {
  apiVersion: '1.0.0',
  requestId: '11111111-1111-4111-8111-111111111111',
  surveyId: '22222222-2222-4222-8222-222222222222',
  externalEventId: 'crm:appointment-0001',
  status: 'queued',
  channels: ['email'],
};

const validationFailedBody = {
  apiVersion: '1.0.0',
  requestId: '33333333-3333-4333-8333-333333333333',
  error: {
    code: 'VALIDATION_FAILED',
    message: 'VALIDATION_FAILED',
    retryable: false,
    fields: [
      { field: 'serviceDate', code: 'FUTURE_DATE' },
      { field: 'email', code: 'INVALID' },
    ],
  },
};

type AuthHelper = (
  credentialsType: string,
  requestOptions: IHttpRequestOptions,
) => Promise<unknown>;

// n8n publishes no community-node test harness: the execute context is a
// hand-rolled stand-in covering only the surface execute() touches.
function fakeExecuteContext(
  items: INodeExecutionData[],
  helper: ReturnType<typeof vi.fn<AuthHelper>>,
): IExecuteFunctions {
  return {
    helpers: { httpRequestWithAuthentication: helper },
    getNode: () => ({}) as INode,
    getInputData: () => items,
    getNodeParameter: (name: string, itemIndex: number) =>
      items[itemIndex]!.json[name],
  } as unknown as IExecuteFunctions;
}

async function runExecute(ctx: IExecuteFunctions) {
  const node = new GetMyOpinion();
  return node.execute!.call(ctx);
}

async function executionError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }

  throw new Error('Expected execute() to throw');
}

function capturedCall(helper: ReturnType<typeof vi.fn<AuthHelper>>, index = 0) {
  const call = helper.mock.calls[index];
  expect(call).toBeDefined();
  return call!;
}

describe('GetMyOpinion node description', () => {
  const node = new GetMyOpinion();

  it('declares the package node identity and credential requirement', () => {
    expect(node.description.name).toBe('n8n-nodes-getmyopinion');
    expect(node.description.displayName).toBe('GetMyOpinion');
    // The icon is the base64 data URI of assets/getmyopinion.svg — asserting
    // against the file keeps the two from drifting apart.
    expect(node.description.icon).toBe(
      'data:image/svg+xml;base64,' +
        readFileSync(
          new URL('../assets/getmyopinion.svg', import.meta.url),
        ).toString('base64'),
    );
    expect(node.description.version).toBe(1);
    expect(node.description.group).toEqual(['transform']);
    expect(node.description.inputs).toEqual(['main']);
    expect(node.description.outputs).toEqual(['main']);
    expect(node.description.credentials).toEqual([
      { name: 'getMyOpinionApi', required: true },
    ]);
  });

  it('maps the shared §2 field table onto node properties', () => {
    expect(node.description.properties).toEqual(
      SURVEY_SEND_FIELDS.map((field) => ({
        name: field.key,
        displayName: field.label,
        type: 'string',
        required: field.required,
        description: field.helpText,
        default: '',
      })),
    );
  });
});

describe('GetMyOpinion Send Survey execute', () => {
  let savedBaseUrl: string | undefined;

  beforeEach(() => {
    savedBaseUrl = process.env[ENV_VAR];
    delete process.env[ENV_VAR];
  });

  afterEach(() => {
    if (savedBaseUrl === undefined) {
      delete process.env[ENV_VAR];
    } else {
      process.env[ENV_VAR] = savedBaseUrl;
    }
  });

  it('POSTs the contract §2 body byte-exact to the production survey-sends endpoint and returns the response body', async () => {
    const helper = vi.fn<AuthHelper>().mockResolvedValueOnce({
      statusCode: 202,
      body: acceptedBody,
      headers: {},
    });

    const output = await runExecute(fakeExecuteContext([sampleItem], helper));

    expect(helper).toHaveBeenCalledTimes(1);

    const [credentialsType, options] = capturedCall(helper);
    expect(credentialsType).toBe('getMyOpinionApi');
    expect(options.method).toBe('POST');
    expect(options.url).toBe(`${PRODUCTION_ORIGIN}${SURVEY_SENDS_PATH}`);
    expect(options.body).toBe(
      JSON.stringify(buildSurveySendPayload(sampleInput)),
    );
    expect(options.body).toBe(
      '{"firstName":"Alice","lastName":"Exemple","email":"alice@example.invalid","serviceCode":"fixture-service","serviceDate":"2026-11-02T10:00:00Z","externalEventId":"crm:appointment-0001"}',
    );
    expect(options.disableFollowRedirect).toBe(true);
    expect(options.ignoreHttpStatusErrors).toBe(true);
    expect(options.returnFullResponse).toBe(true);

    expect(output).toEqual(
      [[{ json: acceptedBody, pairedItem: { item: 0 } }]],
    );
  });

  it('throws a NodeApiError with the halt message and field details on 422 VALIDATION_FAILED', async () => {
    const helper = vi.fn<AuthHelper>().mockResolvedValueOnce({
      statusCode: 422,
      body: validationFailedBody,
      headers: {},
    });

    const error = (await executionError(
      runExecute(fakeExecuteContext([sampleItem], helper)),
    )) as NodeApiError;

    expect(error).toBeInstanceOf(NodeApiError);
    expect(error.httpCode).toBe('422');
    expect(error.message).toContain(
      'GetMyOpinion rejected the request as invalid. Fix the mapped fields and run the Zap again.',
    );
    expect(error.message).toContain('Fields:');
    expect(error.message).toContain('serviceDate: FUTURE_DATE');
    expect(error.description).toBe('VALIDATION_FAILED');
  });

  it('throws a NodeApiError carrying the retry suffix on 503 REQUEST_IN_PROGRESS with Retry-After', async () => {
    const helper = vi.fn<AuthHelper>().mockResolvedValueOnce({
      statusCode: 503,
      body: {
        apiVersion: '1.0.0',
        requestId: '44444444-4444-4444-8444-444444444444',
        error: {
          code: 'REQUEST_IN_PROGRESS',
          message: 'REQUEST_IN_PROGRESS',
          retryable: true,
        },
      },
      headers: { 'retry-after': '7' },
    });

    const error = (await executionError(
      runExecute(fakeExecuteContext([sampleItem], helper)),
    )) as NodeApiError;

    expect(N8N_RETRY_SUFFIX).toBe(
      'Re-running this node with the same external event ID is safe and will not create a duplicate survey.',
    );
    expect(error).toBeInstanceOf(NodeApiError);
    expect(error.httpCode).toBe('503');
    expect(error.message).toContain('The same event is still being processed.');
    expect(error.message).toContain(N8N_RETRY_SUFFIX);
    expect(error.description).toBe('Transient — Retry On Fail re-runs safely');
  });

  it('throws the clock-skew message on 401 AUTH_TIMESTAMP_OUT_OF_WINDOW', async () => {
    const helper = vi.fn<AuthHelper>().mockResolvedValueOnce({
      statusCode: 401,
      body: {
        apiVersion: '1.0.0',
        requestId: '55555555-5555-4555-8555-555555555555',
        error: {
          code: 'AUTH_TIMESTAMP_OUT_OF_WINDOW',
          message: 'AUTH_TIMESTAMP_OUT_OF_WINDOW',
          retryable: false,
        },
      },
      headers: {},
    });

    const error = (await executionError(
      runExecute(fakeExecuteContext([sampleItem], helper)),
    )) as NodeApiError;

    expect(error).toBeInstanceOf(NodeApiError);
    expect(error.httpCode).toBe('401');
    expect(error.message).toContain(
      'Clock skew with the GetMyOpinion server: try again, and reconnect if the error persists.',
    );
  });

  it('sends each item once and aborts the run on the first failure', async () => {
    const secondItem: INodeExecutionData = {
      json: { ...sampleInput, externalEventId: 'crm:appointment-0002' },
    };
    const helper = vi
      .fn<AuthHelper>()
      .mockResolvedValueOnce({
        statusCode: 202,
        body: acceptedBody,
        headers: {},
      })
      .mockResolvedValueOnce({
        statusCode: 422,
        body: validationFailedBody,
        headers: {},
      });

    const error = (await executionError(
      runExecute(fakeExecuteContext([sampleItem, secondItem], helper)),
    )) as NodeApiError;

    expect(error).toBeInstanceOf(NodeApiError);
    expect(helper).toHaveBeenCalledTimes(2);
    expect(capturedCall(helper, 0)[1].body).toBe(
      JSON.stringify(buildSurveySendPayload(sampleInput)),
    );
    expect(capturedCall(helper, 1)[1].body).toBe(
      JSON.stringify(
        buildSurveySendPayload({
          ...sampleInput,
          externalEventId: 'crm:appointment-0002',
        }),
      ),
    );
  });
});

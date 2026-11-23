import {
  PRODUCTION_ORIGIN,
  SURVEY_SENDS_PATH,
  SURVEY_SEND_FIELDS,
  buildSurveySendPayload,
  classifyAuthFailure,
  classifySurveySendFailure,
  resolveBaseUrl,
} from '../../src/core/index.js';
import { NodeConnectionTypes } from 'n8n-workflow';
import type {
  SurveySendErrorBody,
  SurveySendInput,
} from '../../src/core/index.js';
import { NodeApiError } from 'n8n-workflow';
import type {
  IDataObject,
  IExecuteFunctions,
  IHttpRequestOptions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  INodeProperties,
} from 'n8n-workflow';

export const N8N_RETRY_SUFFIX =
  'Re-running this node with the same external event ID is safe and will not create a duplicate survey.';

// Shape of a full response from httpRequestWithAuthentication with
// returnFullResponse and ignoreHttpStatusErrors both set.
interface SurveySendResponse {
  statusCode: number;
  body: IDataObject;
  headers: Record<string, string>;
}

export class GetMyOpinion implements INodeType {
  description: INodeTypeDescription = {
    name: 'n8n-nodes-getmyopinion',
    displayName: 'GetMyOpinion',
    documentationUrl:
      'https://github.com/GetMyOpinion/n8n-nodes-getmyopinion#readme',
    subtitle: 'Send Survey',
    // n8n's 'file:' icon resolution for N8N_CUSTOM_EXTENSIONS nodes is broken
    // upstream (the loader rewrites iconUrl to an 'icons/CUSTOM/…' route that
    // only resolves on some distribution paths) and it clobbers any iconUrl we
    // set ourselves. A data URI in `icon` round-trips verbatim and renders
    // everywhere. The Icon type union has no data-URI member — hence the cast.
    // Payload: base64 of assets/getmyopinion.svg; the test suite asserts the
    // two stay in sync (regenerate when the brand mark lands).
    icon: ('data:image/svg+xml;base64,' +
      'PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyBpZD0iQ2FscXVlXzEiIGRhdGEtbmFtZT0iQ2FscXVlIDEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgdmlld0JveD0iMCAwIDI5OS44MSAyODUuMTQiPgogIDxkZWZzPgogICAgPHN0eWxlPgogICAgICAuY2xzLTEgewogICAgICAgIGZpbGw6ICNmYzUwMDA7CiAgICAgIH0KICAgIDwvc3R5bGU+CiAgPC9kZWZzPgogIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTIuMjEsMTA4LjkxbC0xLjEuOGMtLjM3LS4yNy0uNzQtLjU0LTEuMS0uOGgyLjIxWiIvPgogIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTI1LjQ5LDEwOC45MWwtMTIuNzUsOS4yNWMtLjk2LS43LTEuOTItMS4zOS0yLjg4LTIuMDlsOS44OC03LjE2aDUuNzZaIi8+CiAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNNTEuNjYsMTA4LjkxbC0yNS44NiwxOC43NWMtMS40NC0xLjA1LTIuODgtMi4xLTQuMzItMy4xNGwyMS41My0xNS42MWg4LjY1WiIvPgogIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTgwLjcxLDEwOC45MWwtNDAuNCwyOS4yOWMtMS45Mi0xLjM5LTMuODQtMi44LTUuNzctNC4xOGwzNC42My0yNS4xMWgxMS41NFoiLz4KICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik0xMTIuNjgsMTA4LjkxbC01Ni40LDQwLjljLTIuNC0xLjc1LTQuOC0zLjQ5LTcuMjEtNS4yNGw0OS4xNy0zNS42NWgxNC40NFoiLz4KICA8cG9seWdvbiBjbGFzcz0iY2xzLTEiIHBvaW50cz0iMTUwLjM4IDEuNDYgMTQ5LjE0IDIuMzUgMTQ5LjkxIDAgMTUwLjM4IDEuNDYiLz4KICA8cG9seWdvbiBjbGFzcz0iY2xzLTEiIHBvaW50cz0iMTU0LjgyIDE1LjEyIDE0MS45NyAyNC40NCAxNDMuNzQgMTguOTggMTUzLjczIDExLjc0IDE1NC44MiAxNS4xMiIvPgogIDxwb2x5Z29uIGNsYXNzPSJjbHMtMSIgcG9pbnRzPSIxNTkuODEgMzAuNDggMTMzLjkgNDkuMjcgMTM2LjU3IDQxLjA4IDEzNi41NyA0MS4wNyAxNTguMTcgMjUuNDEgMTU5LjgxIDMwLjQ4Ii8+CiAgPHBvbHlnb24gY2xhc3M9ImNscy0xIiBwb2ludHM9IjE2NS4zNiA0Ny41NCAxMjQuOTQgNzYuODUgMTI4LjUgNjUuODkgMTYzLjE2IDQwLjc2IDE2NS4zNiA0Ny41NCIvPgogIDxwb2x5Z29uIGNsYXNzPSJjbHMtMSIgcG9pbnRzPSIxNzEuNDUgNjYuMyAxMTUuMDggMTA3LjE3IDExOS41NCA5My40NyAxNjguNjkgNTcuODMgMTcxLjQ1IDY2LjMiLz4KICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik0xNzguMSw4Ni43NWwtMTA0LjQsNzUuN2MtMi44OC0yLjEtNS43Ny00LjItOC42Ni02LjI4bDEwOS43Ni03OS42LDMuMywxMC4xOFoiLz4KICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik0xODUuMywxMDguOWgwYy0zMC44OSwyMi40NC02MS43Nyw0NC44OC05Mi42NSw2Ny4zMi0uMDMtLjAyLS4wNi0uMDQtLjA5LS4wNy0zLjM3LTIuNDQtNi43My00Ljg5LTEwLjEtNy4zNGw5OC45OC03MS43OCwzLjg2LDExLjg2WiIvPgogIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTIwNy4xNywxNzYuMjJsMzUuMzksMTA4LjkxLTkyLjY0LTY3LjMxLTkyLjY1LDY3LjMxYzQyLjY4LTU4Ljc0LDg1LjM2LTExNy40OCwxMjguMDQtMTc2LjIyaDExNC41MmwtOTIuNjQsNjcuMzFaIi8+CiAgPGc+CiAgICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik0xODUuMywxMDguOWgwcy05Mi43NCw2Ny4yNi05Mi43NCw2Ny4yNmMtMy4zNy0yLjQ0LTYuNzMtNC44OS0xMC4xLTcuMzRsOTguOTgtNzEuNzgsMy44NiwxMS44NloiLz4KICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTE3OC4xLDg2Ljc1bC0xMDQuNCw3NS43Yy0yLjg4LTIuMS01Ljc3LTQuMi04LjY2LTYuMjhsMTA5Ljc2LTc5LjYsMy4zLDEwLjE4WiIvPgogICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNMTEyLjY4LDEwOC45MWwtNTYuNCw0MC45Yy0yLjQtMS43NS00LjgtMy40OS03LjIxLTUuMjRsNDkuMTctMzUuNjVoMTQuNDRaIi8+CiAgICA8cG9seWdvbiBjbGFzcz0iY2xzLTEiIHBvaW50cz0iMTcxLjQ1IDY2LjMgMTE1LjA4IDEwNy4xNyAxMTkuNTQgOTMuNDcgMTY4LjY5IDU3LjgzIDE3MS40NSA2Ni4zIi8+CiAgICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik04MC43MSwxMDguOTFsLTQwLjQsMjkuMjljLTEuOTItMS4zOS0zLjg0LTIuOC01Ljc3LTQuMThsMzQuNjMtMjUuMTFoMTEuNTRaIi8+CiAgICA8cG9seWdvbiBjbGFzcz0iY2xzLTEiIHBvaW50cz0iMTY1LjM2IDQ3LjU0IDEyNC45NCA3Ni44NSAxMjguNSA2NS44OSAxNjMuMTYgNDAuNzYgMTY1LjM2IDQ3LjU0Ii8+CiAgICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik01MS42NiwxMDguOTFsLTI1Ljg2LDE4Ljc1Yy0xLjQ0LTEuMDUtMi44OC0yLjEtNC4zMi0zLjE0bDIxLjUzLTE1LjYxaDguNjVaIi8+CiAgICA8cG9seWdvbiBjbGFzcz0iY2xzLTEiIHBvaW50cz0iMTU5LjgxIDMwLjQ4IDEzMy45IDQ5LjI3IDEzNi41NyA0MS4wOCAxMzYuNTcgNDEuMDcgMTU4LjE3IDI1LjQxIDE1OS44MSAzMC40OCIvPgogICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNMjUuNDksMTA4LjkxbC0xMi43NSw5LjI1Yy0uOTYtLjctMS45Mi0xLjM5LTIuODgtMi4wOWw5Ljg4LTcuMTZoNS43NloiLz4KICAgIDxwb2x5Z29uIGNsYXNzPSJjbHMtMSIgcG9pbnRzPSIxNTQuODIgMTUuMTIgMTQxLjk3IDI0LjQ0IDE0My43NCAxOC45OCAxNTMuNzMgMTEuNzQgMTU0LjgyIDE1LjEyIi8+CiAgICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik0wLDEwOC45MWgyLjIxbC0xLjEuOGMtLjM3LS4yNy0uNzQtLjU0LTEuMS0uOFoiLz4KICAgIDxwb2x5Z29uIGNsYXNzPSJjbHMtMSIgcG9pbnRzPSIxNTAuMzggMS40NiAxNDkuMTQgMi4zNSAxNDkuOTEgMCAxNTAuMzggMS40NiIvPgogIDwvZz4KPC9zdmc+') as INodeTypeDescription['icon'],
    group: ['transform'],
    usableAsTool: true,
    version: 1,
    description:
      'Sends a GetMyOpinion satisfaction survey invitation for a completed service.',
    defaults: {},
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    credentials: [{ name: 'getMyOpinionApi', required: true }],
    properties: SURVEY_SEND_FIELDS.map(
      (field): INodeProperties => ({
        name: field.key,
        displayName: field.label,
        type: 'string',
        required: field.required,
        description: field.helpText,
        default: '',
      }),
    ),
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const baseUrl = resolveBaseUrl({ defaultOrigin: PRODUCTION_ORIGIN });
    const results: INodeExecutionData[] = [];

    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      const input: SurveySendInput = {
        firstName: this.getNodeParameter('firstName', itemIndex) as string,
        lastName: this.getNodeParameter('lastName', itemIndex) as string,
        email: this.getNodeParameter('email', itemIndex) as string | undefined,
        phone: this.getNodeParameter('phone', itemIndex) as string | undefined,
        serviceCode: this.getNodeParameter('serviceCode', itemIndex) as string,
        serviceDate: this.getNodeParameter('serviceDate', itemIndex) as string,
        externalEventId: this.getNodeParameter(
          'externalEventId',
          itemIndex,
        ) as string,
      };

      const request: IHttpRequestOptions = {
        method: 'POST',
        url: baseUrl + SURVEY_SENDS_PATH,
        body: JSON.stringify(buildSurveySendPayload(input)),
        disableFollowRedirect: true,
        ignoreHttpStatusErrors: true,
        returnFullResponse: true,
      };

      const response = (await this.helpers.httpRequestWithAuthentication.call(
        this,
        'getMyOpinionApi',
        request,
      )) as SurveySendResponse;

      const { statusCode } = response;

      if (statusCode < 300) {
        results.push({ json: response.body, pairedItem: { item: itemIndex } });
        continue;
      }

      if (statusCode === 401) {
        const { message } = classifyAuthFailure(
          response.body as SurveySendErrorBody,
        );

        throw new NodeApiError(
          this.getNode(),
          { statusCode },
          { message, httpCode: String(statusCode) },
        );
      }

      const failure = classifySurveySendFailure(
        statusCode,
        response.body as SurveySendErrorBody,
        response.headers['retry-after'] ?? null,
        N8N_RETRY_SUFFIX,
      );

      throw new NodeApiError(
        this.getNode(),
        { statusCode },
        {
          message: failure.message,
          httpCode: String(statusCode),
          description:
            failure.kind === 'retry'
              ? 'Transient — Retry On Fail re-runs safely'
              : failure.code,
        },
      );
    }

    return [results];
  }
}

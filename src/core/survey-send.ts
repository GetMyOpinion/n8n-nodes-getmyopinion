export interface SurveySendInput {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  serviceCode: string;
  serviceDate: string;
  externalEventId: string;
}

export interface SurveySendPayload {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  serviceCode: string;
  serviceDate: string;
  externalEventId: string;
}

/**
 * Contract §2 field order — matches the frozen signature vectors. Contact
 * fields are included only when truthy, so an absent or empty email/phone is
 * dropped rather than sent as null or "".
 */
export function buildSurveySendPayload(
  input: SurveySendInput,
): SurveySendPayload {
  return {
    firstName: input.firstName,
    lastName: input.lastName,
    ...(input.email ? { email: input.email } : {}),
    ...(input.phone ? { phone: input.phone } : {}),
    serviceCode: input.serviceCode,
    serviceDate: input.serviceDate,
    externalEventId: input.externalEventId,
  };
}

export interface GmoFieldDescriptor {
  key: keyof SurveySendInput;
  label: string;
  required: boolean;
  helpText: string;
}

export const SURVEY_SEND_FIELDS: readonly GmoFieldDescriptor[] = [
  {
    key: 'firstName',
    label: 'First Name',
    required: true,
    helpText: "Customer's first name, as on the appointment.",
  },
  {
    key: 'lastName',
    label: 'Last Name',
    required: true,
    helpText: "Customer's last name, as on the appointment.",
  },
  {
    key: 'email',
    label: 'Email',
    required: false,
    helpText:
      'ASCII email address. Required unless a phone number is provided. ' +
      "With both contacts, the centre's strategy selects email, SMS, or both " +
      '(email by default). If SMS is disabled, only email is queued.',
  },
  {
    key: 'phone',
    label: 'Phone',
    required: false,
    helpText:
      'International number starting with + (E.164), e.g. +33612345678. ' +
      'Required unless an email is provided. Phone-only sends require SMS to be enabled.',
  },
  {
    key: 'serviceCode',
    label: 'Service Code',
    required: true,
    helpText:
      'Exact GetMyOpinion activity key for the service (letters, digits, . _ -), ' +
      'not the numeric service ID.',
  },
  {
    key: 'serviceDate',
    label: 'Service Date',
    required: true,
    helpText:
      'Actual completed service time, ISO 8601 with offset, e.g. ' +
      '2026-11-02T10:00:00+01:00. No future dates.',
  },
  {
    key: 'externalEventId',
    label: 'External Event ID',
    required: true,
    helpText:
      'Stable ID of the service event, prefixed by its source, e.g. ' +
      'crm:appointment-0001. Identical across retries and re-runs of the ' +
      'same event — never generate a new one to bypass an error.',
  },
];

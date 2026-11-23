import { createHash, createHmac } from 'node:crypto';

export interface GmoAuthContext {
  keyId: string;
  secret: string;
}

export type GmoAuthHeaders = {
  'x-gmo-key': string;
  'x-timestamp': string;
  'x-signature': string;
};

export function currentTimestampSeconds(nowMs: number = Date.now()): string {
  return String(Math.floor(nowMs / 1000));
}

/**
 * Builds the three GMO authentication headers per contract 1.0.0 §3.
 *
 * The canonical string is five LF-joined lines (method, path, empty query,
 * lowercase-hex SHA-256 of the raw body, timestamp). The HMAC key is the
 * UTF-8 bytes of the secret text — the base64url string is never decoded.
 */
export function buildGmoAuthHeaders(
  method: string,
  pathname: string,
  body: string,
  auth: GmoAuthContext,
  timestampSeconds: string = currentTimestampSeconds(),
): GmoAuthHeaders {
  const bodySha256 = createHash('sha256').update(body, 'utf8').digest('hex');
  const canonical = [
    method.toUpperCase(),
    pathname,
    '',
    bodySha256,
    timestampSeconds,
  ].join('\n');

  const hmac = createHmac('sha256', Buffer.from(auth.secret, 'utf8'))
    .update(canonical, 'utf8')
    .digest('base64');

  return {
    'x-gmo-key': auth.keyId,
    'x-timestamp': timestampSeconds,
    'x-signature': `sha256=${hmac}`,
  };
}

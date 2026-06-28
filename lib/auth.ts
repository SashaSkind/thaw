/**
 * Shared-secret header auth for every `/v1` endpoint.
 *
 * OWNER (real): Sasha (service spine). This is a local stand-in so Brandon's
 * endpoints enforce the same contract before Sasha pushes the real helper:
 * every request must send the shared secret in the `x-service-secret` header.
 *
 * Demo behavior: when `SERVICE_SHARED_SECRET` is unset the service runs in OPEN
 * mode (auth skipped) so the local demo UI can call its own endpoints with zero
 * configuration. Set the secret to require the header (matches production).
 */

const SECRET_HEADER = "x-service-secret";

export interface AuthResult {
  ok: boolean;
  reason?: string;
}

export function authorize(request: Request): AuthResult {
  const expected = process.env.SERVICE_SHARED_SECRET?.trim();

  // No secret configured -> open demo mode.
  if (!expected) {
    return { ok: true };
  }

  const provided = request.headers.get(SECRET_HEADER)?.trim();
  if (!provided) {
    return { ok: false, reason: `Missing ${SECRET_HEADER} header` };
  }
  if (provided !== expected) {
    return { ok: false, reason: "Invalid shared secret" };
  }
  return { ok: true };
}

export function isAuthEnforced(): boolean {
  return Boolean(process.env.SERVICE_SHARED_SECRET?.trim());
}

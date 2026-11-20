/**
 * NEROXA V1 — isolated Cloudflare HOSTED_SERVER *candidate contract*.
 * Offline verifier only, not imported by any Worker or route. Returning true here
 * is NOT operational admission: trusted version attestation, a durable nonce
 * ledger, TLS, database readiness, authorization and rollback are still required.
 * In particular, callers MUST NOT construct expected/trust from request headers,
 * request bodies, unsigned environment variables or the receipt being checked.
 */
import { createPublicKey, verify as ed25519Verify } from 'node:crypto';

const CLAIM_KEYS = [
  'scope', 'accountId', 'workerId', 'versionId', 'releaseSha256',
  'projectRef', 'backendOrigin', 'domains', 'nonce',
  'notBeforeMs', 'expiresAtMs',
];
const IDENTITIES = [
  'accountId', 'workerId', 'versionId', 'releaseSha256',
  'projectRef', 'backendOrigin',
];
const hex32 = /^[0-9a-f]{32}$/;
const hex64 = /^[0-9a-f]{64}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const project = /^[a-z]{20}$/;
const domain = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const b64url = /^[A-Za-z0-9_-]+$/;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function strictSortedDomains(values) {
  return Array.isArray(values) && values.length > 0 && values.length <= 10 &&
    values.every(v => typeof v === 'string' && domain.test(v)) &&
    values.every((v, i) => i === 0 || values[i - 1] < v);
}
function strictlyDecodeB64url(value, max) {
  if (typeof value !== 'string' || !value || value.length > max || !b64url.test(value)) return null;
  const data = Buffer.from(value, 'base64url');
  return data.toString('base64url') === value ? data : null;
}
function validOrigin(value) {
  if (typeof value !== 'string' || value.length > 253) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && u.origin === value && !u.username && !u.password &&
      !u.port && domain.test(u.hostname);
  } catch { return false; }
}

/**
 * True means only a well-formed Ed25519 receipt matches an independently pinned
 * expectation inside its time window. It does NOT consume a nonce or enable I/O.
 */
export function verifyCloudflareHostedIdentity({ receipt, expected, trust, nowMs } = {}) {
  try {
    if (!plain(receipt) || !plain(expected) || !plain(trust) || !Number.isSafeInteger(nowMs)) return false;
    if (Object.keys(receipt).length !== 2 || !Object.hasOwn(receipt, 'payload') || !Object.hasOwn(receipt, 'signature')) return false;
    if (typeof trust.publicKeyPem !== 'string' || !Number.isSafeInteger(trust.maxValidityMs) ||
        trust.maxValidityMs < 1 || trust.maxValidityMs > 15 * 60 * 1000) return false;
    const payload = strictlyDecodeB64url(receipt.payload, 8192);
    const signature = strictlyDecodeB64url(receipt.signature, 1024);
    if (!payload || !signature || signature.length !== 64) return false;
    const raw = payload.toString('utf8');
    if (!Buffer.from(raw).equals(payload)) return false;
    const claims = JSON.parse(raw);
    if (!plain(claims) || CLAIM_KEYS.some((k, i) => Object.keys(claims)[i] !== k) ||
        Object.keys(claims).length !== CLAIM_KEYS.length || JSON.stringify(claims) !== raw) return false;
    if (claims.scope !== 'HOSTED_SERVER' || !hex32.test(claims.accountId) || !hex32.test(claims.workerId) ||
        !uuid.test(claims.versionId) || !hex64.test(claims.releaseSha256) || !project.test(claims.projectRef) ||
        !validOrigin(claims.backendOrigin) || !strictSortedDomains(claims.domains) || !hex64.test(claims.nonce)) return false;
    if (!Number.isSafeInteger(claims.notBeforeMs) || !Number.isSafeInteger(claims.expiresAtMs) ||
        claims.notBeforeMs > nowMs || claims.expiresAtMs <= nowMs ||
        claims.expiresAtMs <= claims.notBeforeMs ||
        claims.expiresAtMs - claims.notBeforeMs > trust.maxValidityMs) return false;
    if (IDENTITIES.some(k => claims[k] !== expected[k]) ||
        !strictSortedDomains(expected.domains) || JSON.stringify(claims.domains) !== JSON.stringify(expected.domains)) return false;
    const pub = createPublicKey(trust.publicKeyPem);
    if (pub.asymmetricKeyType !== 'ed25519') return false;
    return ed25519Verify(null, payload, pub, signature);
  } catch { return false; }
}

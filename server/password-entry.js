// @noble/hashes (MIT), door de bouwstap gebundeld voor Apps Script.
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { hmac } from '@noble/hashes/hmac.js';
import { utf8ToBytes, bytesToHex } from '@noble/hashes/utils.js';
export function derive(pin, salt, pepper, iterations) {
  const prehash = hmac(sha256, utf8ToBytes(pepper), utf8ToBytes(pin));
  return bytesToHex(pbkdf2(sha256, prehash, utf8ToBytes(salt), {c: iterations, dkLen: 32}));
}

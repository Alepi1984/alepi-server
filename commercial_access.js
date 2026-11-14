const crypto = require('node:crypto');

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function createActivationCode() {
  const parts = [];
  // Rejection sampling avoids modulo bias: 256 is divisible by 32.
  const bytes = crypto.randomBytes(12);
  for (let i = 0; i < 12; i += 4) {
    parts.push(Array.from(bytes.subarray(i, i + 4), (byte) => alphabet[byte & 31]).join(''));
  }
  return `ALP-${parts.join('-')}`;
}

function hashActivationCode(code) {
  return crypto.createHash('sha256').update(String(code).trim().toUpperCase(), 'utf8').digest('hex');
}

function createDeviceToken() { return crypto.randomBytes(32).toString('base64url'); }
function hashDeviceToken(token) { return crypto.createHash('sha256').update(String(token), 'utf8').digest('hex'); }

function bearerToken(header) {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(String(header || ''));
  return match ? match[1] : null;
}

function validLicense(license, now) {
  return license?.status === 'ACTIVE' && new Date(license.expires_at).getTime() > now.getTime();
}

function eligibleForPairing({ license, sourceAuthorized, existingDevices, alreadyLinked = false, now = new Date() }) {
  return Boolean(sourceAuthorized && validLicense(license, now) &&
    Number(existingDevices) <= Number(license.max_devices) &&
    (alreadyLinked || Number(existingDevices) < Number(license.max_devices)));
}

function licenseAllowsSync({ license, authenticated, linked, now = new Date() }) {
  return Boolean(authenticated && linked && validLicense(license, now));
}
module.exports = { createActivationCode, hashActivationCode, createDeviceToken, hashDeviceToken, bearerToken, eligibleForPairing, licenseAllowsSync };

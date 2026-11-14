const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createActivationCode,
  hashActivationCode,
  createDeviceToken,
  hashDeviceToken,
  bearerToken,
  eligibleForPairing,
  licenseAllowsSync,
} = require('../commercial_access');

test('un codigo comercial es corto, aleatorio y se almacena solo como hash', () => {
  const a = createActivationCode();
  const b = createActivationCode();
  assert.match(a, /^ALP-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.notEqual(a, b);
  assert.equal(hashActivationCode(a.toLowerCase()), hashActivationCode(a));
  assert.doesNotMatch(hashActivationCode(a), /ALP/);
});

test('tokens de dispositivo son secretos independientes y Bearer exige sintaxis estricta', () => {
  const a = createDeviceToken();
  const b = createDeviceToken();
  assert.notEqual(a, b);
  assert.equal(hashDeviceToken(a), hashDeviceToken(a));
  assert.notEqual(hashDeviceToken(a), hashDeviceToken(b));
  assert.equal(bearerToken(`Bearer ${a}`), a);
  assert.equal(bearerToken(`Basic ${a}`), null);
  assert.equal(bearerToken('Bearer hola otro'), null);
});

test('vinculacion respeta fecha, revocacion, cupo y pertenencia del origen', () => {
  const license = { status: 'ACTIVE', expires_at: '2026-11-01T00:00:00.000Z', max_devices: 2 };
  const now = new Date('2026-10-01T00:00:00.000Z');
  assert.equal(eligibleForPairing({ license, sourceAuthorized: true, existingDevices: 1, alreadyLinked: false, now }), true);
  assert.equal(eligibleForPairing({ license, sourceAuthorized: false, existingDevices: 1, alreadyLinked: false, now }), false);
  assert.equal(eligibleForPairing({ license, sourceAuthorized: true, existingDevices: 2, alreadyLinked: false, now }), false);
  assert.equal(eligibleForPairing({ license, sourceAuthorized: true, existingDevices: 2, alreadyLinked: true, now }), true);
  assert.equal(eligibleForPairing({ license, sourceAuthorized: true, existingDevices: 3, alreadyLinked: true, now }), false);
  assert.equal(eligibleForPairing({ license: { ...license, status: 'REVOKED' }, sourceAuthorized: true, existingDevices: 1, now }), false);
  assert.equal(eligibleForPairing({ license, sourceAuthorized: true, existingDevices: 1, now: new Date('2026-11-01T00:00:00.000Z') }), false);
});

test('sincronizacion requiere licencia vigente, vinculo del negocio y token del dispositivo', () => {
  const license = { status: 'ACTIVE', expires_at: '2026-11-01T00:00:00.000Z' };
  const now = new Date('2026-10-01T00:00:00.000Z');
  assert.equal(licenseAllowsSync({ license, authenticated: true, linked: true, now }), true);
  assert.equal(licenseAllowsSync({ license, authenticated: false, linked: true, now }), false);
  assert.equal(licenseAllowsSync({ license, authenticated: true, linked: false, now }), false);
  assert.equal(licenseAllowsSync({ license: null, authenticated: true, linked: true, now }), false);
});

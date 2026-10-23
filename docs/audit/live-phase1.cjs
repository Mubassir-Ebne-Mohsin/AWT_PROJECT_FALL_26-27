const assert = require('node:assert/strict');
const base = process.env.AUDIT_API_URL || 'http://localhost:5001';
const email = `completion-${Date.now()}@example.test`;
const password = 'Audit-Pass-123!';
const results = [];
async function call(label, path, expected, options = {}) {
  const res = await fetch(base + path, options);
  const body = res.status === 204 ? null : await res.json();
  assert.equal(res.status, expected, `${label}: ${JSON.stringify(body)}`);
  results.push({ check: label, status: res.status });
  return { res, body };
}
const post = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const cookie = res => res.headers.getSetCookie().find(c => c.startsWith('sf_refresh=')).split(';')[0];
(async () => {
  const health = await call('Postgres and Redis healthy', '/v1/health', 200);
  assert.equal(health.body.data.status, 'ok'); assert.equal(health.body.data.postgres, 'up'); assert.equal(health.body.data.redis, 'up');
  for (const path of ['/docs', '/docs-json']) {
    const r = await fetch(base + path); assert.equal(r.status, 200);
    results.push({ check: path, status: r.status });
  }
  const reg = await call('register', '/v1/auth/register', 201, post({ email, password, displayName: 'Completion Audit' }));
  assert.ok(!JSON.stringify(reg.body).match(/passwordHash|argon2/));
  assert.match(reg.res.headers.getSetCookie()[0], /HttpOnly/);
  assert.match(reg.res.headers.getSetCookie()[0], /SameSite=Lax/);
  const login = await call('login', '/v1/auth/login', 200, post({ email, password }));
  const access = login.body.data.accessToken;
  const auth = { Authorization: `Bearer ${access}` };
  const me = await call('me', '/v1/auth/me', 200, { headers: auth });
  assert.equal(me.body.data.email, email);
  const refresh = await call('refresh rotates cookie', '/v1/auth/refresh', 200, { method: 'POST', headers: { Cookie: cookie(login.res) } });
  assert.notEqual(cookie(refresh.res), cookie(login.res));
  await call('logout', '/v1/auth/logout', 204, { method: 'POST', headers: { ...auth, Cookie: cookie(refresh.res) } });
  await call('revoked access', '/v1/auth/me', 401, { headers: auth });
  await call('revoked refresh', '/v1/auth/refresh', 401, { method: 'POST', headers: { Cookie: cookie(refresh.res) } });
  await call('protected without token', '/v1/auth/me', 401);
  const malformed = await call('malformed JSON', '/v1/auth/register', 422, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.body.error.code, 'VALIDATION_FAILED');
  await call('oversized JSON', '/v1/auth/register', 422, post({ email, password: 'x'.repeat(150000), displayName: 'Audit' }));
  const race = await Promise.all([0, 1].map(() => fetch(base + '/v1/auth/register', post({ email: 'race-' + email, password, displayName: 'Race' }))));
  assert.deepEqual(race.map(r => r.status).sort(), [201, 422]);
  results.push({ check: 'concurrent duplicate email', statuses: race.map(r => r.status).sort() });
  const cors = await fetch(base + '/v1/auth/login', { method: 'OPTIONS', headers: { Origin: 'http://localhost:3000', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,authorization' } });
  assert.equal(cors.status, 204);
  assert.equal(cors.headers.get('access-control-allow-origin'), 'http://localhost:3000');
  assert.equal(cors.headers.get('access-control-allow-credentials'), 'true');
  results.push({ check: 'credentialed CORS preflight', status: 204 });
  console.log(JSON.stringify({ passed: true, results }, null, 2));
})().catch(e => { console.error(e.message); process.exitCode = 1; });

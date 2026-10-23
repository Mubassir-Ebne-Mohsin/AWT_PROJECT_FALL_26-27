const { spawn } = require('node:child_process');
const http = require('node:http');
const assert = require('node:assert/strict');
const path = require('node:path');
const cwd = path.resolve(__dirname, '../../nest-boilerplate/nest-boilerplate');
const { randomInt } = require('node:crypto');
const port = randomInt(20000, 60000);
const sourceAddress = `127.111.${randomInt(1, 255)}.${randomInt(1, 255)}`;
const child = spawn(process.execPath, ['dist/main.js'], {
  cwd, env: { ...process.env, PORT: String(port), AUTH_THROTTLE_LIMIT: '10', THROTTLE_LIMIT: '120' }, stdio: 'ignore',
});
const send = () => new Promise((resolve, reject) => {
  const req = http.request({ hostname: '127.0.0.1', port, localAddress: sourceAddress, path: '/v1/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json' } }, res => {
    let body = ''; res.on('data', chunk => body += chunk); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
  });
  req.on('error', reject); req.end('{}');
});
(async () => {
  try {
    let ready = false;
    for (let i = 0; i < 50; i++) {
      if (child.exitCode !== null) throw Error('Audit rate-limit API could not start');
      try { if ((await fetch(`http://127.0.0.1:${port}/v1/health`)).ok) { ready = true; break; } } catch {}
      await new Promise(r => setTimeout(r, 200));
    }
    assert.ok(ready, 'Audit API did not become healthy');
    const statuses = [];
    for (let i = 0; i < 12; i++) { const r = await send(); statuses.push(r.status); assert.equal(r.body.error.code, i < 10 ? 'VALIDATION_FAILED' : 'RATE_LIMITED'); }
    assert.deepEqual(statuses, [...Array(10).fill(422), 429, 429]);
    console.log(JSON.stringify({ passed: true, rateLimit: 10, statuses }));
  } finally { child.kill(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });

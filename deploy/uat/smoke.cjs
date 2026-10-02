const assert = require('node:assert/strict');

const baseUrl = (process.env.LRT_BASE_URL || 'https://rating.example.ru').replace(/\/$/, '');
const password = process.env.UAT_PASSWORD;
const registrationEnabled = process.env.ALLOW_SELF_REGISTRATION === 'true';
const accounts = [
  ['admin@skuratovcoffee.ru', 'ADMIN'],
  ['coo@skuratovcoffee.ru', 'COO'],
  ['cityleader@skuratovcoffee.ru', 'CITY_LEADER'],
  ['leader@skuratovcoffee.ru', 'LEADER'],
];
if (!password || password.length < 12) throw new Error('Set UAT_PASSWORD (at least 12 characters)');

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  let body;
  try { body = await response.json(); } catch { body = undefined; }
  return { status: response.status, body: body?.data === undefined ? body : body.data };
}

async function main() {
  const health = await request('/api/health');
  assert.equal(health.status, 200, 'API health endpoint should return 200');
  assert.equal(health.body?.status, 'ok');
  assert.equal(health.body?.database, 'ok');

  for (const [email, role] of accounts) {
    const login = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(login.status, 200, `Login failed for ${email}`);
    assert.equal(login.body?.user?.role, role, `Unexpected role for ${email}`);
    assert(login.body?.accessToken, `Missing token for ${email}`);
    const me = await request('/api/auth/me', { headers: { Authorization: `Bearer ${login.body.accessToken}` } });
    assert.equal(me.status, 200, `Authenticated profile failed for ${email}`);
    assert.equal(me.body?.email, email);
  }

  const registration = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Public registration probe', email: accounts[0][0], password }),
  });
  assert.equal(registration.status, registrationEnabled ? 409 : 403,
    registrationEnabled ? 'Enabled registration should reject the existing admin email without creating an account' : 'Public registration should be disabled for UAT');
  console.log(`UAT smoke passed at ${baseUrl}: health, all four role logins, profile access, registration gate.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

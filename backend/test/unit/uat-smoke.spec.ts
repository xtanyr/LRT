import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { resolve } from 'node:path';

const password = 'controlled-uat-password';
const accounts: Record<string, string> = {
  'admin@skuratovcoffee.ru': 'ADMIN',
  'coo@skuratovcoffee.ru': 'COO',
  'cityleader@skuratovcoffee.ru': 'CITY_LEADER',
  'leader@skuratovcoffee.ru': 'LEADER',
};

async function runSmoke(registrationEnabled: boolean, expectedSetting?: string) {
  const registrationEmails: string[] = [];
  let createdUsers = 0;
  const server = createServer(async (request, response) => {
    const reply = (status: number, body: unknown) => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(body));
    };
    if (request.url === '/api/health') {
      reply(200, { status: 'ok', database: 'ok' });
      return;
    }
    if (request.url === '/api/auth/me') {
      const email = request.headers.authorization?.replace('Bearer ', '') || '';
      reply(accounts[email] ? 200 : 401, { success: true, data: { email, role: accounts[email] } });
      return;
    }
    let rawBody = '';
    for await (const chunk of request) rawBody += chunk;
    const body = JSON.parse(rawBody || '{}');
    if (request.url === '/api/auth/login') {
      reply(accounts[body.email] && body.password === password ? 200 : 401, {
        success: true,
        data: { accessToken: body.email, user: { email: body.email, role: accounts[body.email] } },
      });
      return;
    }
    if (request.url === '/api/auth/register') {
      registrationEmails.push(body.email);
      if (!registrationEnabled) reply(403, { message: 'Public registration is disabled' });
      else if (accounts[body.email]) reply(409, { message: 'User with this email already exists' });
      else {
        createdUsers += 1;
        reply(201, { success: true, data: { accessToken: body.email, user: { role: 'LEADER' } } });
      }
      return;
    }
    reply(404, { message: 'Not found' });
  });
  await new Promise<void>((resolveListening) => server.listen(0, '127.0.0.1', resolveListening));
  const port = (server.address() as AddressInfo).port;
  const env: NodeJS.ProcessEnv = { ...process.env, UAT_PASSWORD: password, LRT_BASE_URL: `http://127.0.0.1:${port}` };
  delete env.ALLOW_SELF_REGISTRATION;
  if (expectedSetting !== undefined) env.ALLOW_SELF_REGISTRATION = expectedSetting;
  try {
    const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolveExit, reject) => {
      const child = spawn(process.execPath, [resolve(__dirname, '../../../deploy/uat/smoke.cjs')], { env });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => { child.kill(); reject(new Error('UAT smoke timed out')); }, 6000);
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('error', (error) => { clearTimeout(timer); reject(error); });
      child.on('close', (code) => { clearTimeout(timer); resolveExit({ code, stdout, stderr }); });
    });
    return { ...result, registrationEmails, createdUsers };
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolveClosed, reject) => server.close((error) => error ? reject(error) : resolveClosed()));
  }
}

describe('UAT deployment smoke registration probe', () => {
  it('checks enabled registration with an existing email without creating an account', async () => {
    const result = await runSmoke(true, 'true');

    expect(result.code).toBe(0);
    expect(result.createdUsers).toBe(0);
    expect(result.registrationEmails).toEqual(['admin@skuratovcoffee.ru']);
    expect(result.stderr).toBe('');
  });

  it.each([undefined, 'false'])('checks disabled registration when setting is %s', async (setting) => {
    const result = await runSmoke(false, setting);

    expect(result.code).toBe(0);
    expect(result.createdUsers).toBe(0);
    expect(result.stderr).toBe('');
  });

  it.each([
    [false, 'true'],
    [true, 'false'],
  ] as const)('fails when server registration=%s disagrees with setting=%s', async (serverEnabled, setting) => {
    const result = await runSmoke(serverEnabled, setting);

    expect(result.code).toBe(1);
    expect(result.createdUsers).toBe(0);
  });
});

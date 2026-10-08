import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { app } from './index';

describe('Logging Redaction', () => {
  it('does not log sensitive information', async () => {
    // We can spy on process.stdout.write
    const stdoutSpy = vi.spyOn(process.stdout, 'write');

    await request(app)
      .post('/auth/request-otp')
      .send({ email: 'supersecret@college.example' });

    // Let pino flush
    await new Promise(r => setTimeout(r, 50));

    const logs = stdoutSpy.mock.calls.join('\\n');
    expect(logs).not.toContain('supersecret@college.example');

    stdoutSpy.mockRestore();
  });
});

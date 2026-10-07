import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from './index';

describe('Health check', () => {
  it('GET /health returns 200 ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

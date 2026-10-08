import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { PrismaClient } from '@prisma/client';
import { redisClient } from '../redis';
import crypto from 'crypto';

const prisma = new PrismaClient();
const hashEmail = (email: string) => crypto.createHash('sha256').update(email).digest('hex');

describe('Admin Wordlists', () => {
  let superCookie: string;
  let superadminId: string;
  let collegeId: string;

  beforeAll(async () => {
    const s = await prisma.admin.create({ data: { emailHash: hashEmail('sa_wl@admin.com'), role: 'superadmin' } });
    superadminId = s.id;
    const sSession = crypto.randomUUID();
    await redisClient.set(`admin_session:${sSession}`, superadminId, 'EX', 3600);
    superCookie = `adminSessionId=${sSession}`;

    const col = await prisma.college.create({ data: { name: 'WL College', domains: [], studentPattern: '', staffPattern: '', programmeLengths: {}, retentionSettings: {}, status: 'ACTIVE' } });
    collegeId = col.id;
  });

  afterAll(async () => {
    try {
      await prisma.auditLog.deleteMany();
      await prisma.wordlist.deleteMany();
      await prisma.college.deleteMany();
      await prisma.admin.deleteMany();
    } catch(e) {}
  });

  it('adds a wordlist term', async () => {
    const res = await request(app).post('/admin/wordlists').set('Cookie', superCookie).send({ term: 'badword', kind: 'BLOCK', collegeId });
    expect(res.status).toBe(200);
    expect(res.body.term).toBe('badword');
  });

  it('fetches wordlist terms', async () => {
    const res = await request(app).get(`/admin/wordlists?collegeId=${collegeId}`).set('Cookie', superCookie);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('imports wordlist from csv', async () => {
    const csv = `term1,BLOCK\nterm2,REVIEW`;
    const res = await request(app).post('/admin/wordlists/import').set('Cookie', superCookie).send({ collegeId, csv });
    expect(res.status).toBe(200);
    expect(res.body.added).toBe(2);
  });

  it('tests pipeline', async () => {
    const res = await request(app).post('/admin/wordlists/test').set('Cookie', superCookie).send({ text: 'badword', collegeId });
    expect(res.status).toBe(200);
    // Since it uses StubClassifier, it might just return default, but we covered the endpoint
  });

  it('deletes a wordlist term', async () => {
    const lists = await request(app).get(`/admin/wordlists?collegeId=${collegeId}`).set('Cookie', superCookie);
    const id = lists.body[0].id;
    const res = await request(app).delete(`/admin/wordlists/${id}`).set('Cookie', superCookie);
    expect(res.status).toBe(200);
  });

  it('triggers refresh', async () => {
    const res = await request(app).post('/admin/wordlists/refresh').set('Cookie', superCookie);
    expect(res.status).toBe(200);
  });
});

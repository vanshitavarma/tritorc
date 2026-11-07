import { describe, it, expect } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';

describe('Health & Liveness/Readiness Routes', () => {
  describe('GET /api/health/live', () => {
    it('returns 200 with status ok and uptime', async () => {
      const response = await request(app).get('/api/health/live');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(typeof response.body.uptimeSeconds).toBe('number');
    });
  });

  describe('GET /api/health/ready', () => {
    it('returns 503 when database is not connected', async () => {
      const initialReadyState = mongoose.connection._readyState;
      mongoose.connection._readyState = 0;

      try {
        const response = await request(app).get('/api/health/ready');

        expect(response.status).toBe(503);
        expect(response.body.status).toBe('not_ready');
        expect(response.body.services.database.status).toBe('disconnected');
      } finally {
        mongoose.connection._readyState = initialReadyState;
      }
    });

    it('returns 200 when database is connected', async () => {
      const initialReadyState = mongoose.connection._readyState;
      mongoose.connection._readyState = 1;

      try {
        const response = await request(app).get('/api/health/ready');

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('ready');
        expect(response.body.services.database.status).toBe('connected');
      } finally {
        mongoose.connection._readyState = initialReadyState;
      }
    });
  });

  describe('GET /api/health', () => {
    it('returns comprehensive health state without exposing credentials', async () => {
      const response = await request(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(['ok', 'degraded']).toContain(response.body.status);
      expect(typeof response.body.uptimeSeconds).toBe('number');
      expect(response.body.services.database).toBeDefined();
      expect(response.body.services.ai).toBeDefined();

      const responseString = JSON.stringify(response.body);
      expect(responseString).not.toContain('mongodb://');
      expect(responseString).not.toContain('mongodb+srv://');
      expect(responseString).not.toContain('password');
      expect(responseString).not.toContain('secret');
    });
  });
});

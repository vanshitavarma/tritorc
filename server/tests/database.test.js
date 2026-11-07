import { describe, it, expect, vi } from 'vitest';
import mongoose from 'mongoose';
import {
  sanitizeMongoUri,
  getDatabaseStatus,
  disconnectDatabase,
  connectDatabase,
} from '../src/config/database.js';

describe('MongoDB Connection Lifecycle & Utilities', () => {
  describe('sanitizeMongoUri', () => {
    it('masks username and password in standard connection strings', () => {
      const sensitiveUri = 'mongodb://app_user:superSecret123@cluster.mongodb.net:27017/tender_db';
      const sanitized = sanitizeMongoUri(sensitiveUri);

      expect(sanitized).not.toContain('superSecret123');
      expect(sanitized).not.toContain('app_user');
      expect(sanitized).toContain('***:***@cluster.mongodb.net:27017/tender_db');
    });

    it('masks credentials in mongodb+srv connection strings', () => {
      const srvUri = 'mongodb+srv://admin:pass456@prod-cluster.mongodb.net/test?retryWrites=true';
      const sanitized = sanitizeMongoUri(srvUri);

      expect(sanitized).not.toContain('pass456');
      expect(sanitized).not.toContain('admin');
      expect(sanitized).toContain('***:***@prod-cluster.mongodb.net');
    });

    it('returns URI unchanged when no credentials are present', () => {
      const cleanUri = 'mongodb://localhost:27017/tritorc_tenders';
      expect(sanitizeMongoUri(cleanUri)).toBe(cleanUri);
    });

    it('returns empty string when given falsy input', () => {
      expect(sanitizeMongoUri('')).toBe('');
      expect(sanitizeMongoUri(null)).toBe('');
    });
  });

  describe('getDatabaseStatus', () => {
    it('accurately reflects mongoose connection state', () => {
      const status = getDatabaseStatus();
      expect(['disconnected', 'connected', 'connecting', 'disconnecting']).toContain(status.status);
      expect(typeof status.isReady).toBe('boolean');
    });
  });

  describe('Lifecycle methods', () => {
    it('disconnectDatabase is safe to call when already disconnected', async () => {
      await expect(disconnectDatabase()).resolves.not.toThrow();
    });

    it('connectDatabase avoids reconnecting if already connected', async () => {
      const initialReadyState = mongoose.connection._readyState;
      mongoose.connection._readyState = 1;
      const connectSpy = vi.spyOn(mongoose, 'connect');

      try {
        await connectDatabase('mongodb://localhost:27017/test');
        expect(connectSpy).not.toHaveBeenCalled();
      } finally {
        mongoose.connection._readyState = initialReadyState;
        connectSpy.mockRestore();
      }
    });
  });
});

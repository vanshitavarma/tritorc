import { randomUUID } from 'node:crypto';

const ONE_HOUR_MS = 60 * 60 * 1000;

class ScanStore {
  constructor() {
    this.scans = new Map();
    this.reports = new Map();
  }

  generateId() {
    return randomUUID();
  }

  saveScan(id, data) {
    const record = {
      ...data,
      id,
      createdAt: data.createdAt || new Date().toISOString(),
      expiresAt: Date.now() + ONE_HOUR_MS,
    };
    this.scans.set(id, record);
    return record;
  }

  getScan(id) {
    const record = this.scans.get(id);
    if (!record) return null;
    if (Date.now() > record.expiresAt) {
      this.scans.delete(id);
      this.reports.delete(id);
      return null;
    }
    return record;
  }

  saveReport(id, buffer) {
    this.reports.set(id, {
      buffer,
      expiresAt: Date.now() + ONE_HOUR_MS,
    });
  }

  getReport(id) {
    const record = this.reports.get(id);
    if (!record) return null;
    if (Date.now() > record.expiresAt) {
      this.reports.delete(id);
      return null;
    }
    return record.buffer;
  }

  clear() {
    this.scans.clear();
    this.reports.clear();
  }
}

export const scanStore = new ScanStore();

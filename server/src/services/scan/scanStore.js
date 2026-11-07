import { randomUUID } from 'node:crypto';

const ONE_HOUR_MS = 60 * 60 * 1000;

class ScanStore {
  constructor() {
    this.scans = new Map();
    this.reports = new Map();
    this.csvReports = new Map();
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
      this.csvReports.delete(id);
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

  saveCsvReport(id, buffer) {
    this.csvReports.set(id, {
      buffer,
      expiresAt: Date.now() + ONE_HOUR_MS,
    });
  }

  getCsvReport(id) {
    const record = this.csvReports.get(id);
    if (!record) return null;
    if (Date.now() > record.expiresAt) {
      this.csvReports.delete(id);
      return null;
    }
    return record.buffer;
  }

  getAllScans() {
    const valid = [];
    const now = Date.now();
    for (const [id, record] of this.scans.entries()) {
      if (now > record.expiresAt) {
        this.scans.delete(id);
      } else {
        valid.push(record);
      }
    }
    return valid;
  }

  clear() {
    this.scans.clear();
    this.reports.clear();
    this.csvReports.clear();
  }

  clearAll() {
    this.clear();
  }
}

export const scanStore = new ScanStore();

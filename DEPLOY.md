# Deployment Guide

## Production Environment Variables

### Server
- `PORT`: Port number on which Express listens (e.g. 5000 or assigned by host).
- `CLIENT_ORIGIN`: Allowed origins for CORS (e.g. https://tender-scanner.example.com).
- `MAX_UPLOAD_MB`: Upper bound for uploaded tender document sizes in megabytes (e.g. 10).

### Client
- `VITE_API_URL`: Base URL for API requests when served externally.

## Build and Run

### 1. Build Client Assets
```bash
cd client
npm ci
npm run build
```
Static production output will be generated in `client/dist`.

### 2. Run Server
```bash
cd server
npm ci --omit=dev
node --env-file=.env src/server.js
```
The server will enforce CORS limits and validate all environment parameters on boot.

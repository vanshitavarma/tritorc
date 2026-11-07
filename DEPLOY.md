# TenderIQ — Production Deployment Guide

This guide details the step-by-step procedure for deploying **TenderIQ** across cloud infrastructure (MongoDB Atlas, Google Gemini API, and Node.js hosting platforms such as Render, Railway, AWS, or Docker).

---

## 1. Cloud Infrastructure Overview

```
                      +-----------------------------+
                      |   Client: Vercel / Netlify  |
                      |   React 19 + Vite Frontend  |
                      +--------------+--------------+
                                     |
                             HTTPS / WSS / API
                                     v
                      +-----------------------------+
                      | Backend: Render / Railway   |
                      | Node.js 22 + Express API    |
                      +-------+--------------+------+
                              |              |
                      gRPC / REST        Atlas Driver
                              v              v
            +-------------------+    +----------------------+
            |  Google GenAI     |    |   MongoDB Atlas M0+  |
            |  - gemini-2.5-f   |    |   - scans            |
            |  - gemini-emb-001 |    |   - tender_documents |
            +-------------------+    |   - document_chunks  |
                                     |   - Vector Search    |
                                     +----------------------+
```

---

## 2. Environment Variables Reference

### Backend (`server/.env`)
| Variable | Required | Example / Recommended | Description |
| :--- | :---: | :--- | :--- |
| `PORT` | Yes | `5000` (or assigned by `$PORT`) | Port on which Express server listens |
| `CLIENT_ORIGIN` | Yes | `https://tenderiq.yourdomain.com` | Allowed CORS origin URL |
| `MAX_UPLOAD_MB` | No | `10` | Maximum file size in MB per uploaded document |
| `MAX_FILES` | No | `10` | Maximum documents per scan batch |
| `MONGODB_URI` | Yes | `mongodb+srv://user:pass@cluster0.xxx.mongodb.net/tritorc?retryWrites=true&w=majority` | MongoDB Atlas connection string |
| `AI_ENABLED` | Yes | `true` | Enables Gemini summarization and chatbot |
| `GEMINI_API_KEY` | Yes | `AIzaSy...` | Google GenAI API key |
| `GEMINI_GENERATION_MODEL` | No | `gemini-2.5-flash` | Gemini model for summarization & chat |
| `GEMINI_EMBEDDING_MODEL` | No | `gemini-embedding-001` | Official embedding model |
| `EMBEDDING_DIMENSIONS` | No | `768` | Dense vector output dimensions |
| `VECTOR_INDEX_NAME` | No | `tender_vector_index` | Name of Atlas Vector Search index |

### Frontend (`client/.env`)
| Variable | Required | Example | Description |
| :--- | :---: | :--- | :--- |
| `VITE_API_URL` | No | `/api` (or `https://api.yourdomain.com/api`) | Backend API base path |

---

## 3. MongoDB Atlas Configuration

### Step 1: Cluster Setup
1. Create a free M0 cluster or dedicated M10+ cluster on [MongoDB Atlas](https://cloud.mongodb.com/).
2. In **Database Access**, create a database user with `readWriteAnyDatabase` privileges.
3. In **Network Access**, add an IP Access entry:
   - For Render/Railway dynamic IPs: Add `0.0.0.0/0` (Allow Access from Anywhere).
   - For dedicated servers/VPS: Add your specific static server IP address.

### Step 2: Create Vector Search Index
1. In the Atlas dashboard, select your cluster and click **Atlas Search** $\rightarrow$ **Create Search Index**.
2. Select **JSON Editor** under **Atlas Vector Search**.
3. Target Database: `tritorc` (or your configured database name).
4. Target Collection: `document_chunks`.
5. Index Name: `tender_vector_index`.
6. Insert the index JSON schema:
```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 768,
      "similarity": "cosine"
    },
    {
      "type": "filter",
      "path": "documentId"
    },
    {
      "type": "filter",
      "path": "scanId"
    }
  ]
}
```
7. Click **Create Search Index**. The initial build takes approximately 1–2 minutes. Verify status shows `READY` and queryable `true`.

---

## 4. Backend Deployment (Render / Railway / VPS)

### Option A: Render.com Web Service
1. Link your GitHub repository to Render.
2. Select **Web Service** with runtime **Node**.
3. Build Command:
   ```bash
   cd server && npm ci --omit=dev
   ```
4. Start Command:
   ```bash
   cd server && node src/server.js
   ```
5. Add all Backend Environment Variables in the Render Dashboard.
6. Under Health Check Path, enter `/api/health`.

### Option B: Railway.app Service
1. Create a new project and select **Deploy from GitHub repo**.
2. Set Root Directory to `/server`.
3. Railway automatically detects Node.js.
4. Set Environment Variables in Railway settings.

### Option C: Docker Container
Use the standard multi-stage Docker build:
```dockerfile
FROM node:22-alpine AS backend
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ ./
EXPOSE 5000
CMD ["node", "src/server.js"]
```

---

## 5. Frontend Deployment (Vercel / Netlify)

### Vercel Deployment
1. Link your GitHub repository in Vercel.
2. Root Directory: `client`.
3. Framework Preset: `Vite`.
4. Build Command: `npm run build`.
5. Output Directory: `dist`.
6. Environment Variables:
   - `VITE_API_URL`: `https://your-backend-service.onrender.com/api` (if on separate domain)
7. Configure single-page application routing in `vercel.json`:
```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://your-backend-api.onrender.com/api/:path*" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

---

## 6. Pre-Production Verification Checklist

Before accepting client or evaluator traffic, verify the following:

- [ ] **Health Check**: `curl -I https://api.yourdomain.com/api/health` returns `200 OK` with database `connected`.
- [ ] **Vector Index Check**: MongoDB Atlas index `tender_vector_index` is in `READY` status.
- [ ] **CORS Verification**: Sending an `OPTIONS` preflight request from the frontend domain returns `Access-Control-Allow-Origin`.
- [ ] **Rate Limiting**: Sending rapid-fire requests triggers `429 Too Many Requests` after 120 hits.
- [ ] **Multi-File Scan**: Uploading the 3 sample GeM PDFs simultaneously produces an Excel file with all 24 columns preserved.
- [ ] **Non-Tender Filtering**: Uploading `Tender_Keyword_Scanner_Assignment.pdf` is flagged as `NON_TENDER` and excluded from the primary sheet.
- [ ] **RAG Grounded Chat**: Asking `"What equipment is required?"` on SAIL tender cites Page numbers and quote excerpts.
- [ ] **State Resolution**: Location displays `BANHARPALI, Odisha`, `INDIRA GANDHI COMPLEX, Tamil Nadu`, and `Rourkela, Odisha`.
- [ ] **Security**: No secrets or `.env` files are exposed in git history or client bundles.

---

## 7. Troubleshooting

| Issue | Root Cause | Solution |
| :--- | :--- | :--- |
| `Could not connect to any servers in your MongoDB Atlas cluster` | IP address is not whitelisted | Add `0.0.0.0/0` in Atlas **Network Access**. |
| `Search index tender_vector_index not found` | Index name mismatch or building | Verify index name in Atlas matches `VECTOR_INDEX_NAME` and is `READY`. |
| `models/gemini-embedding-001 is not found` | Invalid API key or model ID | Ensure `GEMINI_EMBEDDING_MODEL=gemini-embedding-001` and API key is valid. |
| `File exceeds maximum allowed size` | File larger than 10MB | Increase `MAX_UPLOAD_MB` in `server/.env`. |
| `CORS request blocked` | Misconfigured `CLIENT_ORIGIN` | Set `CLIENT_ORIGIN` to match frontend URL without trailing slash. |

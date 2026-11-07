# Tender / Scope-of-Work Keyword Scanner

A keyword scanner and relevance assessment system for Tritorc tender documents (.pdf and .docx). The application matches industrial bolting and machining keywords, calculates a relevance verdict, and produces both JSON output and a structured spreadsheet report.

## Project Structure

```
tender-scanner/
  client/               # React (Vite) frontend with SCSS
    src/
      api/              # API client and endpoints
      components/       # Reusable UI components
      hooks/            # Custom React hooks
      pages/            # Page-level components
      styles/           # SCSS stylesheets and design tokens
  server/               # Express backend (ES modules)
    data/               # Reference datasets (keywords.csv)
    src/
      config/           # Environment and runtime configurations
      controllers/      # HTTP request handlers
      middleware/       # Express middlewares (error handling, file upload)
      routes/           # API routes definition
      services/         # Pure business logic services
      utils/            # Logging and custom application errors
    tests/              # Test suites
      fixtures/         # Sample test documents and reports
  docs/                 # Reference documents and screenshots
    reference/          # Format specifications and sample reports
    screenshots/        # UI captures
```

## Prerequisites

- Node.js 22+
- npm or pnpm

## Setup and Running

### Server

1. Navigate to the server folder:
   ```bash
   cd server
   ```
2. Copy environment file:
   ```bash
   cp .env.example .env
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the server:
   ```bash
   npm run dev
   ```

### Client

1. Navigate to the client folder:
   ```bash
   cd client
   ```
2. Copy environment file:
   ```bash
   cp .env.example .env
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```

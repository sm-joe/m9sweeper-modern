export default {
  name: process.env.SERVER_NAME || 'm9sweeper-new',
  host: process.env.SERVER_HOST || '0.0.0.0',
  port: process.env.SERVER_PORT || 3000,
  baseUrl: process.env.SERVER_BASE_URL || 'http://localhost:3000/',
  frontendUrl: process.env.SERVER_FRONTEND_URL || process.env.SERVER_BASE_URL,
  // Reachable from scanner Pods; intentionally distinct from the browser-facing URL.
  reportIngestionUrl: process.env.SCANNER_REPORT_INGESTION_URL || ''
}

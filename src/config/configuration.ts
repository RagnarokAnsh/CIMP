export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  // Comma-separated list of allowed frontend origins. '*' (default) allows all
  // — restrict this in production.
  corsOrigins: process.env.CORS_ORIGINS ?? '*',
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    user: process.env.DB_USER ?? 'support',
    password: process.env.DB_PASSWORD ?? 'support',
    name: process.env.DB_NAME ?? 'support_platform',
    synchronize: (process.env.DB_SYNCHRONIZE ?? 'true') === 'true',
  },
  scan: {
    // 'noop' (default; marks files SKIPPED) | 'clamav'
    driver: process.env.SCAN_DRIVER ?? 'noop',
    clamav: {
      host: process.env.CLAMAV_HOST ?? '127.0.0.1',
      port: parseInt(process.env.CLAMAV_PORT ?? '3310', 10),
      timeoutMs: parseInt(process.env.CLAMAV_TIMEOUT_MS ?? '30000', 10),
    },
  },
  storage: {
    // 'local' | 's3'
    driver: process.env.STORAGE_DRIVER ?? 'local',
    dir: process.env.STORAGE_DIR ?? './uploads',
    s3: {
      endpoint: process.env.S3_ENDPOINT, // e.g. http://localhost:9000 for MinIO
      region: process.env.S3_REGION ?? 'us-east-1',
      bucket: process.env.S3_BUCKET ?? 'support-attachments',
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'true') === 'true',
    },
  },
  // Self-issued JWT staff auth (the only staff auth). The API both mints
  // (POST /api/auth/login) and verifies these HS256 tokens.
  auth: {
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  },
  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL ?? '60', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '120', 10),
    intakeLimit: parseInt(process.env.THROTTLE_INTAKE_LIMIT ?? '10', 10),
  },
  mail: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure: (process.env.SMTP_SECURE ?? 'false') === 'true',
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    from: process.env.MAIL_FROM ?? 'Support Platform <no-reply@support.local>',
    // App base URL used to build links in emails.
    appUrl: process.env.APP_URL ?? 'http://localhost:5173',
  },
  jira: {
    baseUrl: process.env.JIRA_BASE_URL, // https://your-domain.atlassian.net
    email: process.env.JIRA_EMAIL,
    apiToken: process.env.JIRA_API_TOKEN,
    // Shared secret for the inbound status webhook. Leave blank to disable
    // inbound sync (the endpoint then rejects everything).
    webhookSecret: process.env.JIRA_WEBHOOK_SECRET,
  },
  // Authorization policy seam for OD-09: may focal points change issue status?
  focalPointCanTransition:
    (process.env.FOCAL_POINT_CAN_TRANSITION ?? 'false') === 'true',
});

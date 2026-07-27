export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  // Comma-separated list of allowed frontend origins. '*' (default) allows all
  // — restrict this in production.
  corsOrigins: process.env.CORS_ORIGINS ?? '*',
  // Express `trust proxy`. Empty (default) = OFF, so req.ip is the socket peer.
  // Behind a load balancer that peer is the PROXY, and every client then shares
  // one rate-limit bucket. Set to a hop count ('1'), 'loopback', or a
  // comma-separated IP/CIDR list of trusted proxies. See main.ts for why this
  // must be an explicit operator decision rather than on by default.
  trustProxy: process.env.TRUST_PROXY ?? '',
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
  // Machine translation of reporter↔staff messages. 'none' (default) disables
  // it entirely; 'libretranslate' posts to a LibreTranslate-compatible API.
  // TRANSLATE_STAFF_LOCALE is the language your support team reads — inbound
  // reporter messages are translated into it. Reporter-facing replies are
  // translated into the reporter's own locale (from the hand-off token, or
  // TRANSLATE_REPORTER_LOCALES as a fallback set to pre-warm).
  translation: {
    driver: process.env.TRANSLATE_DRIVER ?? 'none',
    apiUrl: process.env.TRANSLATE_API_URL,
    apiKey: process.env.TRANSLATE_API_KEY,
    staffLocale: process.env.TRANSLATE_STAFF_LOCALE ?? 'en',
    reporterLocales: (process.env.TRANSLATE_REPORTER_LOCALES ?? '')
      .split(',')
      .map((l) => l.trim())
      .filter(Boolean),
  },
  // Authorization policy seam for OD-09: may focal points change issue status?
  focalPointCanTransition:
    (process.env.FOCAL_POINT_CAN_TRANSITION ?? 'false') === 'true',
  // CIMP registered as one of its own reporter portals (dogfooding / internal
  // support). Which platform key staff file issues under via the in-app
  // "Get support" button. Must match an existing platform (Admin → Platforms).
  selfSupport: {
    platformKey: process.env.SELF_SUPPORT_PLATFORM_KEY ?? 'cimp',
  },
});

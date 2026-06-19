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
  oidc: {
    issuer: process.env.OIDC_ISSUER,
    jwksUri: process.env.OIDC_JWKS_URI,
    audience: process.env.OIDC_AUDIENCE,
    // Claim names can vary by IdP; allow overrides.
    nameClaim: process.env.OIDC_NAME_CLAIM ?? 'name',
    emailClaim: process.env.OIDC_EMAIL_CLAIM ?? 'email',
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
  },
  // Authorization policy seam for OD-09: may focal points change issue status?
  focalPointCanTransition:
    (process.env.FOCAL_POINT_CAN_TRANSITION ?? 'false') === 'true',

  // DEV ONLY: a local staff login that bypasses OIDC so the staff workspace can
  // be exercised without an identity provider. Force-disabled in production.
  devAuth: {
    enabled:
      (process.env.DEV_AUTH ?? 'false') === 'true' &&
      process.env.NODE_ENV !== 'production',
    secret: process.env.DEV_AUTH_SECRET ?? 'dev-only-not-for-production',
  },
});

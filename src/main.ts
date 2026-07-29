import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { isProductionEnv } from './config/is-production';

// Fail-closed: unset/misspelled NODE_ENV counts as production so Swagger and
// verbose output are never exposed by an omitted env var.
const isProduction = isProductionEnv();

// Translate TRUST_PROXY into the shape Express expects. Returns null for "off".
function resolveTrustProxy(raw: string): number | string | boolean | null {
  const value = raw.trim();
  // Express throws on the strings 'true'/'false' (proxy-addr tries to parse them
  // as IPs), so map them here rather than dying at boot on an obvious value.
  if (!value || value === 'false') return null;
  if (value === 'true') return true;
  // Numeric strings MUST be coerced: Express reads a number as a hop count, but
  // '1' goes to proxy-addr, which reads it as the IPv4 literal 0.0.0.1 — no
  // error, just a trust list that matches nothing. Silent, so easy to miss.
  if (/^\d+$/.test(value)) return Number(value);
  // 'loopback' | 'linklocal' | 'uniquelocal' | comma-separated IPs/CIDRs;
  // Express splits and compiles those itself.
  return value;
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');

  // Security headers (CSP/HSTS/X-Frame-Options/etc.).
  app.use(helmet());
  // Bound JSON/urlencoded bodies to stop large-payload DoS. File uploads go
  // through Multer (10 MB/file), not these parsers, so 1mb here is ample.
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true, limit: '1mb' }));

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  // Drain in-flight requests on SIGTERM/SIGINT (rolling deploys, pod shutdown).
  app.enableShutdownHooks();

  const config = app.get(ConfigService);

  // ThrottlerGuard keys its buckets on req.ip, which Express only derives from
  // X-Forwarded-For when 'trust proxy' is set. Behind an LB/ingress with it
  // unset, req.ip is the proxy for every client, so the login (10/min) and
  // intake (10/min) limits become 10/min for the whole world combined.
  // Deliberately OFF by default: trusting X-Forwarded-For when nothing in front
  // rewrites it lets any client forge a fresh IP per request and evade rate
  // limiting entirely — strictly worse than one shared bucket. Turning this on
  // must be a conscious statement that a proxy really is in front.
  const trustProxy = resolveTrustProxy(config.get<string>('trustProxy') ?? '');
  if (trustProxy !== null) {
    app.set('trust proxy', trustProxy);
  }

  // CORS: '*' in dev, restrict to known origins in production.
  const origins = config.get<string>('corsOrigins') ?? '*';
  app.enableCors({
    origin: origins === '*' ? true : origins.split(',').map((o) => o.trim()),
  });

  // OpenAPI — the contract the frontend's typed client is generated from.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Support & Issue Management Platform API')
    .setDescription('Reporter intake and staff issue-management API.')
    .setVersion('0.1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'staff', // OIDC access token for staff routes
    )
    .addApiKey(
      { type: 'apiKey', in: 'header', name: 'X-Handoff-Token' },
      'handoff', // signed portal token for reporter routes
    )
    .build();
  // Don't expose the full API contract publicly in production.
  if (!isProduction) {
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = config.get<number>('port') ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Support platform API listening on http://localhost:${port}/api`);
  if (!isProduction) {
    // eslint-disable-next-line no-console
    console.log(`OpenAPI docs at http://localhost:${port}/api/docs`);
  }
}
bootstrap();

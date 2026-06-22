import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

const isProduction = process.env.NODE_ENV === 'production';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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

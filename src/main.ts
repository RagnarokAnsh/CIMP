import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

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
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = config.get<number>('port') ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Support platform API listening on http://localhost:${port}/api`);
  // eslint-disable-next-line no-console
  console.log(`OpenAPI docs at http://localhost:${port}/api/docs`);
}
bootstrap();

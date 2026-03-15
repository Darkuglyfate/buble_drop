import type { Server } from 'http';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 3000);
  const configuredFrontendOrigin = process.env.FRONTEND_ORIGIN?.trim();
  if (process.env.NODE_ENV === 'production' && !configuredFrontendOrigin) {
    throw new Error(
      'FRONTEND_ORIGIN must be configured in production for BubbleDrop CORS',
    );
  }

  const frontendOrigins = (configuredFrontendOrigin || 'http://localhost:3001')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  app.enableCors({
    origin: frontendOrigins,
  });

  const server = (await app.listen(port, '0.0.0.0')) as Server;
  server.requestTimeout = 15000;
  server.headersTimeout = 16000;
  server.keepAliveTimeout = 5000;
}
void bootstrap();

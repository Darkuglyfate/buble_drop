import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();

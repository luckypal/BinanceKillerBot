import { NestFactory } from '@nestjs/core';
import { AppEnvironment } from './app.environment';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const appEnvironment = app.get(AppEnvironment);
  const port = process.env.PORT || appEnvironment.port;
  await app.listen(port);
}
bootstrap();

import { NestFactory } from '@nestjs/core';
// import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppEnvironment } from './app.environment';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  const appEnvironment = app.get(AppEnvironment);
  const port = process.env.PORT || appEnvironment.port;
  await app.listen(port);

  // const microApp = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
  //   transport: Transport.TCP,
  //   options: {
  //     host: "127.0.0.1",
  //     port: 8888
  //   }
  // });
  // microApp.listen();
}
bootstrap();

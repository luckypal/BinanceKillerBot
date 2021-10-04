import { join } from 'path';
import { Module } from '@nestjs/common';
import { EnvironmentModule } from '@nestjs-steroids/environment';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TelegramService } from './services/telegram/telegram.service';
import { AppEnvironment } from './app.environment'
import { BinanceService } from './services/binance/binance.service';
import { LogService } from './services/log/log.service';
import { StorageService } from './services/storage/storage.service';
import { StrategyService } from './services/strategy/strategy.service';
import { BotService } from './services/bot/bot.service';
import { ApiController } from './controllers/api/api.controller';
// import { ClientsModule, Transport } from '@nestjs/microservices';

@Module({
  imports: [
    EnvironmentModule.forRoot({
      isGlobal: true,
      loadEnvFile: true,
      useClass: AppEnvironment,
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
    }),
    // ClientsModule.register([
    //   {
    //     name: "SERVICE_A",
    //     transport: Transport.TCP,
    //     options: {
    //       host: "127.0.0.1",
    //       port: 8888
    //     }
    //   }
    // ])
  ],
  controllers: [AppController, ApiController],
  providers: [
    AppService,
    TelegramService,
    BinanceService,
    LogService,
    StorageService,
    StrategyService,
    BotService
  ],
})
export class AppModule { }

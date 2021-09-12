import { Module } from '@nestjs/common';
import { EnvironmentModule } from '@nestjs-steroids/environment';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TelegramService } from './services/telegram/telegram.service';
import { AppEnvironment } from './app.environment'
import { BinanceService } from './services/binance/binance.service';
import { OrderService } from './services/order/order.service';
import { LogService } from './services/log/log.service';
import { StorageService } from './services/storage/storage.service';

@Module({
  imports: [
    EnvironmentModule.forRoot({
      isGlobal: true,
      loadEnvFile: true,
      useClass: AppEnvironment,
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    TelegramService,
    BinanceService,
    OrderService,
    LogService,
    StorageService
  ],
})
export class AppModule { }

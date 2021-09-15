import { Module } from '@nestjs/common';
import { EnvironmentModule } from '@nestjs-steroids/environment';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TelegramService } from './services/telegram/telegram.service';
import { AppEnvironment } from './app.environment'
import { BinanceService } from './services/binance/binance.service';
import { LogService } from './services/log/log.service';
import { StorageService } from './services/storage/storage.service';
import { BalanceService } from './services/balance/balance.service';
import { StrategyService } from './services/strategy/strategy.service';

@Module({
  imports: [
    EnvironmentModule.forRoot({
      isGlobal: true,
      loadEnvFile: true,
      useClass: AppEnvironment,
    }),
    EventEmitterModule.forRoot()
  ],
  controllers: [AppController],
  providers: [
    AppService,
    TelegramService,
    BinanceService,
    LogService,
    StorageService,
    BalanceService,
    StrategyService
  ],
})
export class AppModule { }

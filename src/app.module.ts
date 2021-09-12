import { Module } from '@nestjs/common';
import { EnvironmentModule } from '@nestjs-steroids/environment';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TelegramService } from './services/telegram/telegram.service';
import { AppEnvironment } from './app.environment'
import { BinanceService } from './services/binance/binance.service';

@Module({
  imports: [
    EnvironmentModule.forRoot({
      isGlobal: true,
      loadEnvFile: true,
      useClass: AppEnvironment,
    }),
  ],
  controllers: [AppController],
  providers: [AppService, TelegramService, BinanceService],
})
export class AppModule { }

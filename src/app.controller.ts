import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { BinanceService } from './services/binance/binance.service';
import { LogService } from './services/log/log.service';
import { OrderService } from './services/order/order.service';
import { StorageService } from './services/storage/storage.service';
import { TelegramService } from './services/telegram/telegram.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly orderService: OrderService,
    private readonly binanceService: BinanceService,
    private readonly telegramService: TelegramService,
    private readonly logService: LogService,
    private readonly storageService: StorageService
  ) {
    setTimeout(() => this.storageService.save(), 10 * 1000);
  }

  @Get('logs')
  getStatistics() {
    return JSON.stringify(this.logService.logs, null, 2)
  }

  @Get('orders')
  getOrders() {
    return JSON.stringify(this.orderService.orders, null, 2)
  }

  @Get('signals')
  getSignals() {
    return JSON.stringify(this.telegramService.signals, null, 2)
  }

  @Get('prices')
  getPrices() {
    return JSON.stringify(this.binanceService.prices, null, 2);
  }

  @Get('save')
  saveStorage() {
    return this.storageService.save();
  }
}

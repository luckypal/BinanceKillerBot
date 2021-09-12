import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { BinanceService } from './services/binance/binance.service';
import { LogService } from './services/log/log.service';
import { OrderService } from './services/order/order.service';
import { TelegramService } from './services/telegram/telegram.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    public orderService: OrderService,
    public binanceService: BinanceService,
    public telegramService: TelegramService,
    public logService: LogService
  ) { }

  @Get('logs')
  getStatistics() {
    return this.logService.logs;
  }

  @Get('orders')
  getOrders() {
    return this.orderService.orders;
  }

  @Get('signals')
  getSignals() {
    return this.telegramService.signals;
  }

  @Get('prices')
  getPrices() {
    return this.binanceService.prices;
  }
}

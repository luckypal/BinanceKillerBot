import { Controller, Get, Param, Query } from '@nestjs/common';
import { AppService } from './app.service';
import { BalanceService } from './services/balance/balance.service';
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
    private readonly balanceService: BalanceService,
    private readonly logService: LogService,
    private readonly storageService: StorageService
  ) {
    setTimeout(() => this.storageService.save(), 10 * 1000);
  }

  @Get('tg/start')
  tgAuth() {
    return this.telegramService.start();
  }

  @Get('tg/verify/:code')
  tgVerify(
    @Param('code') code: string
  ) {
    return this.telegramService.verifyCode(code);
  }

  @Get('logs')
  getStatistics() {
    return this.jsonBeautify(this.logService.logs);
  }

  @Get('orders')
  getOrders() {
    return this.jsonBeautify(this.orderService.orders);
  }

  @Get('signals')
  getSignals() {
    return this.jsonBeautify(this.telegramService.signals);
  }

  @Get('prices')
  getPrices() {
    return this.jsonBeautify(this.binanceService.prices);
  }

  @Get('balances')
  getBalances() {
    const total = 10000;
    const buyOnce = 1000;
    const leverage = 1;
    const data = this.balanceService.getBalances(total, buyOnce, leverage);
    return this.jsonBeautify(data);
  }

  @Get('save')
  saveStorage() {
    return this.storageService.save();
  }

  jsonBeautify(data) {
    return JSON.stringify(data, null, 2);
  }
}

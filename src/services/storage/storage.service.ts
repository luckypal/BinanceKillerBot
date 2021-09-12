import * as fs from 'fs';
import { Injectable } from '@nestjs/common';
import { OrderService } from '../order/order.service';
import { BinanceService } from '../binance/binance.service';
import { TelegramService } from '../telegram/telegram.service';
import { LogService } from '../log/log.service';

@Injectable()
export class StorageService {
  filePath = './data/data.json';
  store;

  constructor(
    public readonly orderService: OrderService,
    public readonly binanceService: BinanceService,
    public readonly telegramService: TelegramService,
    public readonly logService: LogService
  ) {
    this.load();
  }

  async save() {
    const orders = this.orderService.orders;
    const signals = this.telegramService.signals;
    const logs = this.logService.logs;

    const data = {
      orders,
      signals,
      logs
    }
    fs.writeFileSync(this.filePath, JSON.stringify(data), { encoding: 'utf8' });

    return data;
  }

  async load() {
    if (!fs.existsSync(this.filePath)) return;

    const str = fs.readFileSync(this.filePath, { encoding: 'utf8' });
    const data = JSON.parse(str);
    this.orderService.orders = data.orders;
    this.telegramService.signals = data.signals;
    this.logService.logs = data.logs;
  }
}

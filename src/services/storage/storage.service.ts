import * as fs from 'fs';
import { Injectable } from '@nestjs/common';
import { BinanceService } from '../binance/binance.service';
import { TelegramService } from '../telegram/telegram.service';
import { LogService } from '../log/log.service';
import { StrategyService } from '../strategy/strategy.service';

@Injectable()
export class StorageService {
  filePath = './data/data.json';
  store;

  constructor(
    public readonly strategyService: StrategyService,
    public readonly binanceService: BinanceService,
    public readonly telegramService: TelegramService,
    public readonly logService: LogService
  ) { }

  async save() {
    const data = this.strategyService.getData();
    const signals = this.telegramService.signals;
    const logs = this.logService.logs;

    const storeData = {
      data,
      signals,
      logs
    }
    fs.writeFileSync(this.filePath, JSON.stringify(storeData), { encoding: 'utf8' });

    return storeData;
  }

  async load() {
    if (!fs.existsSync(this.filePath)) return;

    const str = fs.readFileSync(this.filePath, { encoding: 'utf8' });
    const data = JSON.parse(str);
    this.strategyService.setData(data.data);
    this.telegramService.signals = data.signals;
    this.logService.logs = data.logs;
  }
}

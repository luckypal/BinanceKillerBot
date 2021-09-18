import * as fs from 'fs';
import { Injectable } from '@nestjs/common';
import { BinanceService } from '../binance/binance.service';
import { TelegramService } from '../telegram/telegram.service';
import { StrategyService } from '../strategy/strategy.service';
import { AppEnvironment } from 'src/app.environment';

@Injectable()
export class StorageService {
  dataFilePath = '';
  signalsFilePath = '';

  constructor(
    private readonly appEnvironment: AppEnvironment,
    public readonly strategyService: StrategyService,
    public readonly binanceService: BinanceService,
    public readonly telegramService: TelegramService,
  ) {
    const { logFileDir } = this.appEnvironment;
    this.dataFilePath = `${logFileDir}/data.json`;
    this.signalsFilePath = `${logFileDir}/signals.json`;
  }

  async save() {
    const data = this.strategyService.getData();
    const signals = this.telegramService.signals;

    this.saveFile(this.dataFilePath, data);
    this.saveFile(this.signalsFilePath, signals);
    return true;
  }

  saveFile(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data), { encoding: 'utf8' });
  }

  loadFile(filePath) {
    if (!fs.existsSync(filePath)) return null;
    const str = fs.readFileSync(filePath, { encoding: 'utf8' });
    return JSON.parse(str);
  }

  async load() {
    this.strategyService.setData(this.loadFile(this.dataFilePath) || {});
    this.telegramService.signals = this.loadFile(this.signalsFilePath) || {};

    setTimeout(() => this.save(), 5 * 1000);
    setInterval(() => this.save(), 60 * 1000);
  }
}

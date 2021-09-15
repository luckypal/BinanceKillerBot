import * as fs from 'fs';
import { Injectable } from '@nestjs/common';
import { BinanceService } from '../binance/binance.service';
import { TelegramService } from '../telegram/telegram.service';
import { LogService } from '../log/log.service';
import { StrategyService } from '../strategy/strategy.service';

@Injectable()
export class StorageService {
  fileDir = './data';
  dataFilePath = `${this.fileDir}/data.json`;
  signalsFilePath = `${this.fileDir}/signals.json`;
  logsFilePath = `${this.fileDir}/logs.json`;

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

    this.saveFile(this.dataFilePath, data);
    this.saveFile(this.signalsFilePath, signals);
    this.saveFile(this.logsFilePath, logs);
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
    this.telegramService.signals = this.loadFile(this.signalsFilePath) || [];
    this.logService.logs = this.loadFile(this.logService) || [];

    setInterval(() => this.save(), 60 * 1000);
  }
}

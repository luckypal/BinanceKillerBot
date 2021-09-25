import * as fs from 'fs';
import { Injectable } from '@nestjs/common';
import { BinanceService } from '../binance/binance.service';
import { TelegramService } from '../telegram/telegram.service';
import { StrategyService } from '../strategy/strategy.service';
import { AppEnvironment } from 'src/app.environment';
import { BotService } from '../bot/bot.service';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class StorageService {
  dataFilePath = '';
  signalsFilePath = '';
  botOrderFilePath = '';

  isLoaded = false;

  constructor(
    private readonly appEnvironment: AppEnvironment,
    public readonly strategyService: StrategyService,
    public readonly binanceService: BinanceService,
    public readonly telegramService: TelegramService,
    public readonly botService: BotService,
  ) {
    const { logFileDir } = this.appEnvironment;
    this.dataFilePath = `${logFileDir}/data.json`;
    this.signalsFilePath = `${logFileDir}/signals.json`;
    this.botOrderFilePath = `${logFileDir}/bot_orders.json`;
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async save() {
    if (!this.isLoaded) return;

    const data = this.strategyService.getData();
    const signals = this.telegramService.signals;
    const orders = this.botService.orders;

    this.saveFile(this.dataFilePath, data);
    this.saveFile(this.signalsFilePath, signals);
    this.saveFile(this.botOrderFilePath, orders);
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
    this.botService.orders = this.loadFile(this.botOrderFilePath) || [];

    this.isLoaded = true;

    this.save();
  }
}

import * as fs from 'fs';
import { Controller, Get, Header, HttpCode, Param, Res } from '@nestjs/common';
import { AppService } from './app.service';
import { BinanceService } from './services/binance/binance.service';
import { LogService } from './services/log/log.service';
import { StorageService } from './services/storage/storage.service';
import { StrategyService } from './services/strategy/strategy.service';
import { TelegramService } from './services/telegram/telegram.service';
import { BotService } from './services/bot/bot.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly binanceService: BinanceService,
    private readonly telegramService: TelegramService,
    private readonly logService: LogService,
    private readonly storageService: StorageService,
    private readonly strategyService: StrategyService,
    private readonly botService: BotService
  ) {
    setTimeout(() => this.startController(), 1000);
  }

  startController() {
    this.strategyService.createStrategy();
    this.storageService.load();
    this.binanceService.start();
    setTimeout(() => {
      this.telegramService.start();
    }, 2000);
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
  @HttpCode(201)
  @Header('Content-Type', '	text/html')
  getLogs(@Res() res) {
    const { filePath } = this.logService;
    this.logService.streamLog(filePath, res);
  }

  @Get('blogs')
  @HttpCode(201)
  @Header('Content-Type', '	text/html')
  getBotLogs(@Res() res) {
    const { bFilePath: filePath } = this.logService;
    this.logService.streamLog(filePath, res);
  }

  @Get('mlogs')
  @HttpCode(201)
  @Header('Content-Type', '	text/html')
  getMessageLogs(@Res() res) {
    const { mFilePath: filePath } = this.logService;
    this.logService.streamLog(filePath, res);
  }

  @Get('signals')
  getSignals() {
    return this.jsonBeautify(this.telegramService.signals);
  }

  @Get('prices')
  getPrices() {
    return this.jsonBeautify(this.binanceService.prices);
  }

  @Get('orders')
  getOrders() {
    const data = this.strategyService.getData()
    return this.jsonBeautify(data);
  }

  @Get('borders')
  getBotOrders() {
    return this.jsonBeautify(this.botService.orders);
  }

  @Get('balances')
  getBalances() {
    const total = 6000;
    const buyOnce = 2000;
    const data = this.strategyService.getBalances(total, buyOnce);
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

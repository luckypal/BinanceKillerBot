import BinanceApi, { Binance } from 'binance-api-node'
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from 'eventemitter2';
import { AppEnvironment } from 'src/app.environment';

@Injectable()
export class BinanceService {
  binance: Binance;

  public prices = {};

  constructor(
    private readonly appEnvironment: AppEnvironment,
    private eventEmitter: EventEmitter2
  ) {}

  start() {
    this.binance = BinanceApi({
      apiKey: this.appEnvironment.bncApiKey,
      apiSecret: this.appEnvironment.bncSecKey
    });

    this.updatePrice();
  }

  async updatePrice() {
    this.prices = await this.binance.prices();
    this.eventEmitter.emit('binance.onUpdatePrices', this.prices);

    const { bncUpdateInterval } = this.appEnvironment;
    setTimeout(() => this.updatePrice(), bncUpdateInterval * 1000);
  }
}

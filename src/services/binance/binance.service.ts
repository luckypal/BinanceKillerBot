import BinanceApi, { Binance } from 'binance-api-node'
import { Injectable } from '@nestjs/common';
import { AppEnvironment } from 'src/app.environment';
import { OrderService } from '../order/order.service';

@Injectable()
export class BinanceService {
  binance: Binance;

  public prices = {};

  constructor(
    private readonly appEnvironment: AppEnvironment,
    private readonly orderService: OrderService
  ) {
    setTimeout(() => this.start(), 1000);
  }

  start() {
    this.binance = BinanceApi({
      apiKey: this.appEnvironment.bncApiKey,
      apiSecret: this.appEnvironment.bncSecKey
    });
    this.updatePrice();
  }

  async updatePrice() {
    this.prices = await this.binance.prices();
    this.orderService.onUpdatePrices(this.prices);

    const { bncUpdateInterval } = this.appEnvironment;
    setTimeout(() => this.updatePrice(), bncUpdateInterval * 1000);
  }
}

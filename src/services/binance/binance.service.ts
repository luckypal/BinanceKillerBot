import Binance from 'node-binance-api';
import { Injectable } from '@nestjs/common';
import { AppEnvironment } from 'src/app.environment';
import { OrderService } from '../order/order.service';

@Injectable()
export class BinanceService {
  binance: Binance;

  public prices = {};

  constructor(
    private appEnvironment: AppEnvironment,
    private orderService: OrderService
  ) {
    this.binance = new Binance().options({
      APIKEY: this.appEnvironment.bncApiKey,
      APISECRET: this.appEnvironment.bncSecKey
    });
  }

  async updatePrice() {
    this.prices = await this.binance.prices();
    this.orderService.onUpdatePrices(this.prices);

    const { bncUpdateInterval } = this.appEnvironment;
    setTimeout(this.updatePrice, bncUpdateInterval * 1000);
  }
}

import Binance from 'node-binance-api';
import { Injectable } from '@nestjs/common';
import { AppEnvironment } from 'src/app.environment';

@Injectable()
export class BinanceService {
  binance: Binance;

  public prices = {};

  constructor(

    private appEnvironment: AppEnvironment
  ) {
    this.binance = new Binance().options({
      APIKEY: this.appEnvironment.bncApiKey,
      APISECRET: this.appEnvironment.bncSecKey
    });
  }

  async updatePrice() {
    this.prices = await this.binance.prices();

    const { bncUpdateInterval } = this.appEnvironment;
    setTimeout(this.updatePrice, bncUpdateInterval * 1000);
  }
}

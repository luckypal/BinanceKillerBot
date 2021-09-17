import BinanceApi, { Binance, OcoOrder, Order, OrderSide, OrderType, WalletType } from 'binance-api-node'
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from 'eventemitter2';
import { AppEnvironment } from 'src/app.environment';
import { BncOrder, BncOrderType } from 'src/models/bnc-order';

@Injectable()
export class BinanceService {
  binance: Binance;

  public prices = {};

  constructor(
    private readonly appEnvironment: AppEnvironment,
    private eventEmitter: EventEmitter2
  ) { }

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

  async makeOrder(
    order: BncOrder,
    isMarket: boolean,
    quantity: number
  ) {
    const {
      coin,
      type,
      price,
      stopLoss,
      leverage
    } = order;

    const sQuantity = quantity.toString();
    const sPrice = price.toString();
    const sStopLoss = stopLoss.toString();
    let realOrder: Order | OcoOrder = null;

    if (leverage == 1) {
      if (type == BncOrderType.buy) {
        if (isMarket) {
          realOrder = await this.binance.order({
            symbol: coin,
            side: OrderSide.BUY,
            quantity: sQuantity,
            type: OrderType.MARKET,
          });
        } else {
          realOrder = await this.binance.order({
            symbol: coin,
            side: OrderSide.BUY,
            quantity: sQuantity,
            price: sPrice,
            type: OrderType.LIMIT
          });
        }
      } else {
        realOrder = await this.binance.orderOco({
          symbol: coin,
          side: OrderSide.SELL,
          quantity: sQuantity,
          price: sPrice,
          stopPrice: sStopLoss,
          stopLimitPrice: sStopLoss
        });
      }
    } else {
      // Margin
      if (type == BncOrderType.buy) {
        await this.binance.marginIsolatedTransfer({
          asset: 'USDT',
          symbol: coin,
          transFrom: WalletType.SPOT,
          transTo: WalletType.ISOLATED_MARGIN,
          amount: quantity
        });
        
      }
    }
  }
}

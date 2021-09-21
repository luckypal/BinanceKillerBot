import BinanceApi, { Binance, OrderSide, OrderStatus, OrderType, SideEffectType } from 'binance-api-node'
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from 'eventemitter2';
import { AppEnvironment } from 'src/app.environment';
import { BncOrder, BncOrderType } from 'src/models/bnc-order';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class BinanceService {
  binance: Binance = null;
  lotSizes: Record<string, number> = {};

  public prices = {};

  constructor(
    private readonly appEnvironment: AppEnvironment,
    private eventEmitter: EventEmitter2
  ) { }

  async start() {
    if (this.binance) return;

    this.binance = BinanceApi({
      apiKey: this.appEnvironment.bncApiKey,
      apiSecret: this.appEnvironment.bncSecKey,
    });
    this.updateLotSizes();
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async updatePrice() {
    this.start();
    this.prices = await this.binance.prices();
    this.eventEmitter.emit('binance.onUpdatePrices', this.prices);
  }

  @Cron(CronExpression.EVERY_HOUR)
  async updateLotSizes() {
    this.start();
    this.lotSizes = await this.getLotSizes();
  }

  async getLotSizes() {
    const exchangeInfo = await this.binance.exchangeInfo();
    const info = exchangeInfo.symbols
      .filter(item => item.symbol.endsWith('USDT'));

    const lotSizes: Record<string, number> = {};
    info.forEach((item) => {
      const { symbol } = item;
      const { minQty } = item.filters.find(filter => filter.filterType === 'LOT_SIZE') as any;
      lotSizes[symbol] = parseFloat(minQty);
    });
    return lotSizes;
  }

  /**
   * Get USDT balance of spot
   * @returns float
   */
  async getUsdtBalance() {
    const account = await this.binance.accountInfo();
    const balance = account.balances.find((balance) => balance.asset == 'USDT');
    return parseFloat(balance.free);
  }

  /**
   * Calculate coin quantity from usdts and price
   * @param symbol Coin ex: 'ETHUSDT'
   * @param amount Amount of usdt
   * @param price Price of one coin
   * @returns Quantity of coin
   */
  calculateQuantity(symbol: string, amount: number, price: number) {
    const lotSize = this.lotSizes[symbol];
    const precision = Math.log10(lotSize);
    const num = Math.pow(10, -precision);
    const quantity = Math.floor(amount / price * num) / num;
    return quantity.toString();
  }

  /**
   * Transfer amount to margin isolated
   * @param symbol ex: 'ETHUSDT'
   * @param amount ex: 1000
   * @returns Max using amount of usdt. (The all amount of USDT)
   */
  async transferSpotToMargin(
    symbol: string,
    amount: number,
  ) {
    const balance = await this.getUsdtBalance();
    if (balance < amount) return 0;

    await this.binance.marginIsolatedTransfer({
      symbol,
      amount,
      asset: 'USDT',
      transFrom: 'SPOT',
      transTo: 'ISOLATED_MARGIN',
    });

    const { free } = (await this.binance.marginIsolatedAccount({ symbols: symbol })).assets[0].quoteAsset;
    const { amount: maxBorrow } = await this.binance.marginMaxBorrow({ asset: 'USDT', isolatedSymbol: symbol });
    return parseFloat(free) + parseFloat(maxBorrow);
  }

  /**
   * Return USDTs from margin to Spot
   * @param symbol ex: 'ETHUSDT'
   */
  async transferMarginToSpot(
    symbol: string,
  ) {
    const {
      netAsset,
      borrowed,
      interest
    } = (await this.binance.marginIsolatedAccount({ symbols: symbol })).assets[0].quoteAsset;
    const amountToTransfer = parseFloat(netAsset) - parseFloat(borrowed) - parseFloat(interest);
    await this.binance.marginIsolatedTransfer({
      symbol,
      amount: amountToTransfer,
      asset: 'USDT',
      transTo: 'SPOT',
      transFrom: 'ISOLATED_MARGIN',
    });

    return true;
  }

  async getOrder(
    symbol: string,
    orderId: number,
    isMargin: boolean,
  ) {
    try {
      if (!isMargin) {
        const order = await this.binance.getOrder({ symbol, orderId });
        return order;
      } else {
        const order = await this.binance.marginGetOrder({ symbol, isIsolated: "TRUE", orderId: orderId.toString() });
        return order;
      }
    } catch (e) {
      console.log(e);
      return null;
    }
  }

  async isActiveOrder(
    symbol: string,
    orderId: number,
    isMargin: boolean,
  ) {
    const order = await this.getOrder(symbol, orderId, isMargin);
    if (order && order.status == OrderStatus.NEW) return false;
    return true;
  }

  async makeOrder(
    order: BncOrder,
    isMarket: boolean,
    amount: number
  ) {
    const {
      coin: symbol,
      type,
      price,
      stopLoss,
      leverage
    } = order;

    const sAmount = amount.toString();
    const sPrice = price.toString();
    const sStopLoss = stopLoss && stopLoss.toString();

    if (leverage == 1) {
      if (type == BncOrderType.buy) {
        if (isMarket) {
          return await this.binance.order({
            symbol,
            side: OrderSide.BUY,
            quantity: sAmount, // USDT amount
            type: OrderType.MARKET,
          });
        } else {
          // const quantity = this.calculateQuantity(coin, amount, price);
          await this.binance.order({
            symbol,
            side: OrderSide.BUY,
            quantity: amount.toString(),
            price: sPrice,
            type: OrderType.LIMIT
          });
        }
      } else {
        return await this.binance.orderOco({
          symbol,
          side: OrderSide.SELL,
          quantity: sAmount, // COIN amount
          price: sPrice,
          stopPrice: sStopLoss,
          stopLimitPrice: sStopLoss
        });
      }
    } else {
      // Margin
      if (type == BncOrderType.buy) {
        if (isMarket) {
          return await this.binance.marginOrder({
            symbol,
            isIsolated: "TRUE",
            side: OrderSide.BUY,
            type: OrderType.MARKET,
            sideEffectType: SideEffectType.MARGIN_BUY,
            quoteOrderQty: sAmount, // USDT amount
          })
        } else {
          const quantity = this.calculateQuantity(symbol, amount, price);
          return await this.binance.marginOrder({
            symbol,
            isIsolated: "TRUE",
            side: OrderSide.BUY,
            price: price.toString(),
            type: OrderType.LIMIT,
            quantity,
            sideEffectType: SideEffectType.MARGIN_BUY
          });
        }
      } else {
        const quantity = this.calculateQuantity(symbol, amount, 1);

        return await this.binance.marginOrderOco({
          symbol,
          isIsolated: 'TRUE',
          side: OrderSide.SELL,
          type: OrderType.STOP_LOSS_LIMIT,
          sideEffectType: SideEffectType.AUTO_REPAY,
          price: sPrice,
          quantity,
          stopPrice: sStopLoss,
          stopLimitPrice: sStopLoss,
        })
      }
    }
  }

  async amountToRepay(symbol: string) {
    const info = await this.binance.marginIsolatedAccount({ symbols: symbol });
    const { free } = info.assets[0].baseAsset;
    return parseFloat(free);
  }
}

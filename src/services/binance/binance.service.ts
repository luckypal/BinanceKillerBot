import BinanceApi, { Binance, DailyStatsResult, Order, OrderSide, OrderStatus, OrderType, SideEffectType } from 'binance-api-node'
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from 'eventemitter2';
import { AppEnvironment } from 'src/app.environment';
import { BncOrder, BncOrderType } from 'src/models/bnc-order';
import { Cron, CronExpression } from '@nestjs/schedule';
import { sleep } from 'src/utils';
import { LogService } from '../log/log.service';
import { BNDailyStats } from 'src/models/bk-signal';
import { NewCoin } from 'src/models/new-coin';

@Injectable()
export class BinanceService {
  binance: Binance = null;
  lotSizes: Record<string, number> = {};
  priceFilters: Record<string, number> = {};
  dailyStats: DailyStatsResult[] = [];

  public prices = {};

  public watchSymbol = '';
  public watchPrice = 0;
  public watchTrade = null;

  spotBalance = 0;

  constructor(
    private readonly appEnvironment: AppEnvironment,
    private eventEmitter: EventEmitter2,
    private logService: LogService
  ) { }

  async start() {
    if (this.binance) return;

    this.binance = BinanceApi({
      apiKey: this.appEnvironment.bncApiKey,
      apiSecret: this.appEnvironment.bncSecKey,
    });
    this.updatePrice();
    this.updateLotSizes();
    this.updateBalance();
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async updatePrice() {
    if (!this.binance) return;
    this.prices = await this.binance.prices();
    this.eventEmitter.emit('binance.onUpdatePrices', this.prices);

    if (this.appEnvironment.isDevelopment() && this.watchSymbol) {
      this.watchPrice = this.filterPrice(this.watchSymbol, this.prices[this.watchSymbol]);
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async updateDailyStats() {
    this.dailyStats = (await this.binance.dailyStats()) as DailyStatsResult[];
  }

  @Cron(CronExpression.EVERY_HOUR)
  async updateLotSizes() {
    if (!this.binance) return;
    await this.getLotSizes();
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async updateBalance() {
    this.spotBalance = await this.getUsdtBalance();
  }

  @OnEvent('binance.newcoin')
  async buyNewCoin(coins: NewCoin[]) {
    const { ratioTradeNewCoin } = this.appEnvironment;
    const amount = this.spotBalance * ratioTradeNewCoin;
    const sAmount = Math.floor(amount).toString();

    this.logService.blog('Start to buy new coin', Date.now(), coins);

    coins.forEach(async newCoin => {
      let count = 0;
      const orderLimit = 25;
      const { symbol } = newCoin;
      await sleep(800);
      this.logService.blog('After sleep...', Date.now(), symbol);

      while (count < orderLimit) {
        this.binance.order({
          symbol,
          side: OrderSide.BUY,
          quoteOrderQty: sAmount, // USDT amount
          type: OrderType.MARKET,
        }).then(order => {
          count = orderLimit;
          this.logService.blog('Buy new coin', newCoin, order, Date.now());
          this.onBuyNewCoin(newCoin);
        }).catch(e => {
          const { message } = e;
          console.log('New coin failed', new Date(), count, symbol, message);
        });
        await sleep(20);
        count += 1;
      }
    });
  }

  async onBuyNewCoin(newCoin: NewCoin) {
    const { symbol } = newCoin;
    this.eventEmitter.emit('binance.newCoin.ordered', newCoin);
    this.logPrice(symbol, 5);
    await sleep(5 * 1000);

    await this.updateLotSizes();
    const quantity = await this.getBalance(symbol.replace('USDT', ''));
    const sQuantity = this.calculateQuantity(symbol, quantity, 1);
    const sellOrder = await this.binance.order({
      symbol: symbol,
      side: OrderSide.SELL,
      quantity: sQuantity,
      type: OrderType.MARKET,
    });
    this.logService.blog('Sell new coin', newCoin, sQuantity, sellOrder);
  }

  async logPrice(symbol: string, second: number) {
    for (let i = 0; i < second * 10; i++) {
      this.binance.ws.trades([symbol], trade => {
        const { price } = trade;
        console.log('New coin Price', new Date(), symbol, price);
        this.logService.blog('New coin Price', Date.now(), symbol, price);
      });
      await sleep(100);
    }
  }

  setWatchSymbol(symbol) {
    this.watchSymbol = symbol;
    if (this.watchTrade) this.watchTrade();

    if (this.appEnvironment.isDevelopment()) {
      this.watchPrice = this.filterPrice(this.watchSymbol, this.prices[this.watchSymbol]);
    } else {
      this.watchTrade = this.binance.ws.trades([this.watchSymbol], trade => {
        const {
          symbol,
          price } = trade;
        if (this.watchSymbol != symbol) return;
        this.watchPrice = this.filterPrice(symbol, parseFloat(price));
      });
    }
  }

  async getLotSizes() {
    const exchangeInfo = await this.binance.exchangeInfo();
    const info = exchangeInfo.symbols
      .filter(item => item.symbol.endsWith('USDT'));

    info.forEach((item) => {
      const { symbol } = item;
      const { minQty } = item.filters.find(filter => filter.filterType === 'LOT_SIZE') as any;
      this.lotSizes[symbol] = parseFloat(minQty);

      const { minPrice } = item.filters.find(filter => filter.filterType === 'PRICE_FILTER') as any;
      this.priceFilters[symbol] = parseFloat(minPrice);
    });
  }

  /**
   * 
   * @param symbol ex: ETHUSDT
   * @returns { BTCUSDT: 5, ETHUSDT: 8 }
   */
  getDailyStats(symbol: string): BNDailyStats {
    const btc = this.dailyStats.find(value => value.symbol == 'BTCUSDT');
    const self = this.dailyStats.find(value => value.symbol == symbol);
    if (!btc || !self) return null;

    return {
      BTCUSDT: parseFloat(btc.priceChangePercent),
      [symbol]: parseFloat(self.priceChangePercent)
    };
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

  async getBalance(symbol: string) {
    const account = await this.binance.accountInfo();
    const balance = account.balances.find((balance) => balance.asset == symbol);
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
    if (!lotSize) return (amount / price).toString();

    const precision = Math.log10(lotSize);
    const num = Math.pow(10, -precision);
    const quantity = Math.floor(amount / price * num) / num;
    return quantity.toString();
  }

  filterPrice(symbol: string, price: number) {
    const priceFilter = this.priceFilters[symbol];
    if (!priceFilter) return price;

    const precision = Math.log10(priceFilter);
    const num = Math.pow(10, -precision);
    const newPrice = Math.floor(price * num) / num;
    return newPrice;
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
    retry: number
  ) {
    // const balance = await this.getUsdtBalance();
    // if (balance < amount) return 0;

    if (retry == 3) {
      try {
        await this.binance.enableMarginAccount({ symbol });
      } catch (e) {
        this.logService.blog('marginCreateIsolated', e);
      }
      try {
        await this.binance.marginCreateIsolated({
          base: symbol.replace('USDT', ''),
          quote: 'USDT',
        });
      } catch (e) {
        this.logService.blog('marginCreateIsolated', e);
      }
    }

    try {
      await this.binance.marginIsolatedTransfer({
        symbol,
        amount,
        asset: 'USDT',
        transFrom: 'SPOT',
        transTo: 'ISOLATED_MARGIN',
      });
    } catch (e) {
      this.logService.blog('marginIsolatedTransfer', retry, e);
      await sleep(500);
      if (retry == 0) throw e;
      return this.transferSpotToMargin(symbol, amount, retry - 1);
    }

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
    const isolatedAccount = await this.binance.marginIsolatedAccount({ symbols: symbol });
    let {
      asset,
      netAsset,
      borrowed,
      interest
    } = isolatedAccount.assets[0].quoteAsset;
    const quote_amountToTransfer = parseFloat(netAsset) - parseFloat(borrowed) - parseFloat(interest);

    if (quote_amountToTransfer) {
      await this.binance.marginIsolatedTransfer({
        symbol,
        amount: quote_amountToTransfer,
        asset,
        transTo: 'SPOT',
        transFrom: 'ISOLATED_MARGIN',
      });
    }

    ({
      asset,
      netAsset,
      borrowed,
      interest
    } = isolatedAccount.assets[0].baseAsset);
    const base_amountToTransfer = parseFloat(netAsset) - parseFloat(borrowed) - parseFloat(interest);

    if (base_amountToTransfer) {
      await this.binance.marginIsolatedTransfer({
        symbol,
        amount: base_amountToTransfer,
        asset,
        transTo: 'SPOT',
        transFrom: 'ISOLATED_MARGIN',
      });
    }

    await this.binance.disableMarginAccount({ symbol });

    return {
      quote: quote_amountToTransfer,
      base: base_amountToTransfer
    };
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
      // Not USE
      if (type == BncOrderType.buy) {
        if (isMarket) {
          return await this.binance.order({
            symbol,
            side: OrderSide.BUY,
            quantity: sAmount, // USDT amount
            type: OrderType.MARKET,
          });
        } else {
          const quantity = this.calculateQuantity(symbol, amount, price);
          await this.binance.order({
            symbol,
            side: OrderSide.BUY,
            quantity,
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
        const stopLossLimitPrice = this.filterPrice(symbol, stopLoss * 0.999);

        return await this.binance.marginOrderOco({
          symbol,
          isIsolated: 'TRUE',
          side: OrderSide.SELL,
          type: OrderType.STOP_LOSS_LIMIT,
          sideEffectType: SideEffectType.AUTO_REPAY,
          price: sPrice,
          quantity,
          stopPrice: sStopLoss,
          stopLimitPrice: stopLossLimitPrice.toString(),
        })
      }
    }
  }

  cancelOrder(symbol: string, orderId: number) {
    try {
      return this.binance.marginCancelOrder({
        symbol,
        orderId,
        isIsolated: "TRUE"
      } as any);
    } catch (e) {
      console.log('CANCEL ORDER error', e);
      return null;
    }
  }

  async amountToRepay(symbol: string) {
    const info = await this.binance.marginIsolatedAccount({ symbols: symbol });
    const { free } = info.assets[0].baseAsset;
    return parseFloat(free);
  }
}

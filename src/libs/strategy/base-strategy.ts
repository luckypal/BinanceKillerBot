import { BinanceService } from 'src/services/binance/binance.service';
import { LogService } from 'src/services/log/log.service';
import { TelegramService } from 'src/services/telegram/telegram.service';
import { BKSignal } from '../../models/bk-signal';
import { BncOrder, OrderStatus, OrderType } from '../../models/bnc-order';

export interface OrderProperty {
  getLeverage?: (signal: BKSignal) => number;

  getBuyPrice?: (signal: BKSignal, price: number) => number;

  getSellPrice?: (signal: BKSignal) => number;

  getStopLoss?: (signal: BKSignal, price: number, leverage: number, currentStopLoss: number) => number;
}

export class BaseStrategy {

  public BUY_ORDER_LIFETIME = 24 * 60 * 60 * 1000;
  orders: Record<number, BncOrder> = {};

  constructor(
    public readonly strategyId: string,
    private readonly orderProperty: OrderProperty,
    private readonly logService: LogService,
    private readonly binanceService: BinanceService,
    private readonly telegramService: TelegramService
  ) { }

  onNewSignal(signal: BKSignal) {
    const hasSameOrder = this.cancelOldSameOrders(signal);
    if (hasSameOrder) return;

    const id = Date.now()
    const { prices } = this.binanceService
    const {
      signalId,
      coin
    } = signal;
    const price = prices[coin]
    const leverage = this.getLeverage(signal);
    const newOrder: BncOrder = {
      id,
      signalId: signalId,
      coin: coin,
      type: OrderType.buy,
      price: this.getBuyPrice(signal, price),
      lifeTime: Date.now() + this.BUY_ORDER_LIFETIME,
      leverage,
      status: OrderStatus.active
    };

    this.logService.log(this.strategyId, `New Buy Order #${id} is created.`, newOrder);
    this.orders[id] = newOrder;
  }

  cancelOldSameOrders(signal: BKSignal) {
    Object.values(this.orders)
      .filter(({ coin, status, type }) =>
        coin == signal.coin
        && status == OrderStatus.active
        && type == OrderType.buy)
      .forEach(order => order.status = OrderStatus.cancelled);

    const oldSellOrders = Object.values(this.orders)
      .filter(({ coin, status, type }) =>
        coin == signal.coin
        && status == OrderStatus.active
        && type == OrderType.sell)
    return !!oldSellOrders.length
  }

  getLeverage(signal: BKSignal) {
    try {
      if (this.orderProperty && this.orderProperty.getLeverage)
        return this.orderProperty.getLeverage(signal);
    } catch (e) { console.log(this.strategyId, 'getLeverage', signal, e) }

    return 1;
  }

  getBuyPrice(signal: BKSignal, price: number) {
    try {
      if (this.orderProperty && this.orderProperty.getBuyPrice)
        return this.orderProperty.getBuyPrice(signal, price);
    } catch (e) { console.log(this.strategyId, 'getBuyPrice', signal, e) }

    return signal.ote;
  }

  getSellPrice(signal: BKSignal) {
    try {
      if (this.orderProperty && this.orderProperty.getSellPrice)
        return this.orderProperty.getSellPrice(signal);
    } catch (e) { console.log(this.strategyId, 'getSellPrice', signal, e) }

    const { short } = signal.terms;
    if (short.length == 0) return signal.terms.mid[0];
    return short[short.length - 1];
  }

  getStopLoss(signal: BKSignal, price: number, leverage: number, currentStopLoss: number) {
    let newStopLoss = 0
    try {
      if (this.orderProperty && this.orderProperty.getStopLoss)
        newStopLoss = this.orderProperty.getStopLoss(signal, price, leverage, currentStopLoss);
    } catch (e) { console.log(this.strategyId, 'getStopLoss', signal, e) }

    const { stopLoss } = signal;
    let limit = 0;
    if (currentStopLoss == 0) limit = price * (1 - 1 / leverage / 2);
    return Math.max(newStopLoss, stopLoss, limit, currentStopLoss);
  }

  onUpdatePrices(prices: Record<string, number>) {
    this.updateBuyOrders(prices);
    this.updateSellOrders(prices);
    this.disableOldOrders();
  }

  updateBuyOrders(prices: Record<string, number>) {
    const orders = Object.values(this.orders).filter(({ status, type }) => status == OrderStatus.active && type == OrderType.buy);
    const defId = Date.now();

    orders.forEach((order, index) => {
      const {
        id,
        coin,
        price: targetPrice
      } = order;
      const curPrice = prices[coin];
      if (!curPrice) return;

      if (targetPrice < curPrice) return;

      // If price is smaller than target price
      order.status = OrderStatus.processed;

      const {
        signalId,
        leverage
      } = order;
      const signal = this.telegramService.signals[signalId];
      const newOrderId = defId + index;
      const newOrder: BncOrder = {
        ...order,
        id: newOrderId,
        refOrderId: id,
        type: OrderType.sell,
        price: this.getSellPrice(signal),
        stopLoss: this.getStopLoss(signal, targetPrice, leverage, 0),
        lifeTime: -1,
        status: OrderStatus.active
      };

      this.orders[newOrderId] = newOrder;

      this.logService.log(this.strategyId, `Buy Order #${id} is completed.`, order);
      this.logService.log(this.strategyId, `New sell Order #${newOrderId} is created.`, newOrder);
    })
  }

  updateSellOrders(prices: Record<string, number>) {
    const orders = Object.values(this.orders).filter(({ status, type }) => status == OrderStatus.active && type == OrderType.sell);

    orders.forEach(order => {
      const {
        id,
        signalId,
        coin,
        price: targetPrice,
        leverage,
        stopLoss
      } = order;
      const curPrice = prices[coin];
      if (!curPrice) return;

      const signal = this.telegramService.signals[signalId];
      const newStopLoss = this.getStopLoss(signal, curPrice, leverage, stopLoss);
      if (newStopLoss != stopLoss) {
        this.logService.log(this.strategyId, `Sell Order #${id}: Stop Loss is changed. ${stopLoss} => ${newStopLoss} [ price: ${curPrice} ]`);
        order.stopLoss = newStopLoss;
      }

      if (targetPrice < curPrice
        || newStopLoss > curPrice) {
        // If price is bigger than target price, or price get smaller than stopLoss.
        if (newStopLoss > curPrice) {
          order.status = OrderStatus.stopLess;
        } else {
          order.status = OrderStatus.processed;
        }

        this.logService.log(this.strategyId, `Sell Order #${id} is completed.`, order);
      }
    })
  }

  disableOldOrders() {
    const now = Date.now();
    const orders = Object.values(this.orders)
      .filter(({ status, lifeTime, type }) =>
        status == OrderStatus.active
        && type == OrderType.buy
        && lifeTime != -1
        && lifeTime < now);

    orders.forEach(order => {
      order.status = OrderStatus.timeout;
      this.logService.log(this.strategyId, `Buy Order #${order.id} is up to life time.`, order);
    });
  }

  getBalances(
    primaryUsdt: number,
    buyAmount: number,
  ) {
    const balances = {
      SPOT: primaryUsdt,
      LOAN: 0
    };
    const { prices } = this.binanceService;
    const usdts = {};

    Object.values(this.orders).forEach(order => {
      const {
        coin,
        price,
        stopLoss,
        leverage,
        type,
        status
      } = order;
      if (!balances[coin]) balances[coin] = 0;
      if (
        status != OrderStatus.processed
        && status != OrderStatus.stopLess) return;

      if (type == OrderType.buy) {
        balances.SPOT -= buyAmount;
        balances.LOAN += buyAmount * (leverage - 1);
        balances[coin] += buyAmount * leverage / price;
      } else {
        let sellPrice = price;
        if (status == OrderStatus.stopLess) sellPrice = stopLoss;

        balances.SPOT += balances[coin] * sellPrice;
        balances.LOAN -= buyAmount * (leverage - 1);
        balances[coin] = 0;
      }
    });

    let totalBalance = balances.SPOT - balances.LOAN;
    for (const coin in balances) {
      const price = prices[coin];
      if (!price) continue;
      totalBalance += price * balances[coin];
      usdts[coin] = price * balances[coin];
    }

    return {
      total: {
        TOTAL: totalBalance,
        SPOT: balances.SPOT,
        LOAN: balances.LOAN,
      },
      USDT: usdts,
      coins: balances,
    };
  }
}

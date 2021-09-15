import { BinanceService } from 'src/services/binance/binance.service';
import { LogService } from 'src/services/log/log.service';
import { BKSignal } from '../../services/order/models/bk-signal';
import { BncOrder, OrderStatus, OrderType } from '../../services/order/models/bn-corder';

export interface OrderProperty {
  getLeverage?: (signal: BKSignal) => number;

  getBuyPrice?: (signal: BKSignal, price: number) => number;

  getSellPrice?: (signal: BKSignal) => number;

  getStopLoss?: (signal: BKSignal, price: number, leverage: number) => number;
}

export class BaseStrategy {

  public BUY_ORDER_LIFETIME = 24 * 60 * 60 * 1000;
  orders: Record<number, BncOrder> = {};

  constructor(
    private readonly strategyId: string,
    private readonly orderProperty: OrderProperty,
    private readonly logService: LogService,
    private readonly binanceService: BinanceService
  ) { }

  onNewSignal(signal: BKSignal) {
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
      signal,
      signalId: signalId,
      coin: coin,
      type: OrderType.buy,
      price: this.getBuyPrice(signal, price),
      lifeTime: Date.now() + this.BUY_ORDER_LIFETIME,
      leverage: leverage,
      status: OrderStatus.active
    };

    this.logService.log(this.strategyId, `New Buy Order #${id} is created.`, newOrder);
    this.orders[id] = newOrder;
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

  getStopLoss(signal: BKSignal, price: number, leverage: number) {
    let newStopLoss = 0
    try {
      if (this.orderProperty && this.orderProperty.getStopLoss)
        newStopLoss = this.orderProperty.getStopLoss(signal, price, leverage);
    } catch (e) { console.log(this.strategyId, 'getStopLoss', signal, e) }

    const { stopLoss } = signal;
    const limit = price * (1 - 1 / leverage / 2);
    return Math.max(newStopLoss, stopLoss, limit);
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

      const { signal } = order;
      const newOrderId = defId + index;
      const leverage = this.getLeverage(signal);
      const newOrder: BncOrder = {
        ...order,
        id: newOrderId,
        refOrderId: id,
        type: OrderType.sell,
        price: this.getSellPrice(signal),
        stopLoss: this.getStopLoss(signal, targetPrice, leverage),
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
        coin,
        price: targetPrice,
        stopLoss
      } = order;
      const curPrice = prices[coin];
      if (!curPrice) return;

      if (targetPrice < curPrice
        || stopLoss > curPrice) {
        // If price is bigger than target price, or price get smaller than stopLoss.
        if (stopLoss > curPrice) {
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
}

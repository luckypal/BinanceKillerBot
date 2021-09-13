import { Injectable } from '@nestjs/common';
import { LogService } from '../log/log.service';
import { BKSignal } from './models/bk-signal';
import { BncOrder, OrderStatus, OrderType } from './models/bn-corder';

@Injectable()
export class OrderService {
  public BUY_ORDER_LIFETIME = 24 * 60 * 60 * 1000;
  orders: Record<number, BncOrder> = {};

  constructor(
    private readonly logService: LogService
  ) { }

  onNewSignal(signal: BKSignal) {
    const id = Date.now()
    const newOrder: BncOrder = {
      id,
      signal,
      signalId: signal.signalId,
      coin: signal.coin,
      type: OrderType.buy,
      price: Math.min(...signal.entry),
      lifeTime: Date.now() + this.BUY_ORDER_LIFETIME,
      leverage: 1,
      status: OrderStatus.active
    };

    this.logService.log(`New Buy Order #${id} is created.`, newOrder);
    this.orders[id] = newOrder;
  }

  getSellPrice(signal: BKSignal) {
    const { short } = signal.terms;
    if (short.length == 0) return signal.terms.mid[0];
    return short[short.length - 1];
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
      const newOrder: BncOrder = {
        ...order,
        id: newOrderId,
        refOrderId: id,
        type: OrderType.sell,
        price: this.getSellPrice(signal),
        stopLoss: order.signal.stopLoss,
        lifeTime: -1,
        status: OrderStatus.active
      };

      this.orders[newOrderId] = newOrder;

      this.logService.log(`Buy Order #${id} is completed.`, order);
      this.logService.log(`New sell Order #${newOrderId} is created.`, newOrder);
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

        this.logService.log(`Sell Order #${id} is completed.`, order);
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
      this.logService.log(`Buy Order #${order.id} is up to life time.`, order);
    });
  }
}

import { Injectable } from '@nestjs/common';
import { LogService } from '../log/log.service';
import { BKSignal } from './models/bk-signal';
import { BncOrder, OrderStatus } from './models/bn-corder';

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
      orderStatus: OrderStatus.buy,
      price: signal.ote,
      lifeTime: Date.now() + this.BUY_ORDER_LIFETIME,
      leverage: 1,
      isActive: true
    };

    this.logService.log(`New Buy Order #${id} is created.`, newOrder);
    this.orders[id] = newOrder;
  }

  getTargetPrice(signal: BKSignal) {
    return signal.terms.short[0]
  }

  onUpdatePrices(prices: Record<string, number>) {
    this.updateBuyOrders(prices);
    this.updateSellOrders(prices);
    this.disableOldOrders();
  }

  updateBuyOrders(prices: Record<string, number>) {
    const orders = Object.values(this.orders).filter(({ isActive, orderStatus }) => isActive && orderStatus == OrderStatus.buy);
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
      order.isActive = false;

      const { signal } = order;
      const newOrderId = defId + index;
      const newOrder: BncOrder = {
        ...order,
        id: newOrderId,
        refOrderId: id,
        orderStatus: OrderStatus.sell,
        price: this.getTargetPrice(signal),
        lifeTime: -1,
        isActive: true
      };

      this.orders[newOrderId] = newOrder;

      this.logService.log(`Buy Order #${id} is completed.`, order);
      this.logService.log(`New sell Order #${newOrderId} is created.`, newOrder);
    })
  }

  updateSellOrders(prices: Record<string, number>) {
    const orders = Object.values(this.orders).filter(({ isActive, orderStatus }) => isActive && orderStatus == OrderStatus.sell);

    orders.forEach(order => {
      const {
        id,
        coin,
        price: targetPrice
      } = order;
      const curPrice = prices[coin];
      if (!curPrice) return;

      if (targetPrice > curPrice) return;

      // If price is bigger than target price
      order.isActive = false;

      this.logService.log(`Sell Order #${id} is completed.`, order);
    })
  }

  disableOldOrders() {
    const now = Date.now();
    const orders = Object.values(this.orders)
      .filter(({ isActive, lifeTime, orderStatus }) =>
        isActive
        && orderStatus == OrderStatus.sell
        && lifeTime < now);

    orders.forEach(order => {
      order.isActive = false;
      this.logService.log(`Buy Order #${order.id} is up to life time.`, order);
    });
  }
}

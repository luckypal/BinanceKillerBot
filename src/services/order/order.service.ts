import { Injectable } from '@nestjs/common';
import { LogService } from '../log/log.service';
import { BKSignal } from './models/bk-signal';
import { BncOrder, OrderType } from './models/bn-corder';

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
      orderType: OrderType.buy,
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
    const orders = Object.values(this.orders).filter(({ isActive, orderType }) => isActive && orderType == OrderType.buy);
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
        orderType: OrderType.sell,
        price: this.getTargetPrice(signal),
        stopLoss: order.signal.stopLoss,
        lifeTime: -1,
        isActive: true
      };

      this.orders[newOrderId] = newOrder;

      this.logService.log(`Buy Order #${id} is completed.`, order);
      this.logService.log(`New sell Order #${newOrderId} is created.`, newOrder);
    })
  }

  updateSellOrders(prices: Record<string, number>) {
    const orders = Object.values(this.orders).filter(({ isActive, orderType }) => isActive && orderType == OrderType.sell);

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
        order.isActive = false;
        if (stopLoss > curPrice) order.price = stopLoss;

        this.logService.log(`Sell Order #${id} is completed.`, order);
      }
    })
  }

  disableOldOrders() {
    const now = Date.now();
    const orders = Object.values(this.orders)
      .filter(({ isActive, lifeTime, orderType }) =>
        isActive
        && orderType == OrderType.sell
        && lifeTime < now);

    orders.forEach(order => {
      order.isActive = false;
      this.logService.log(`Buy Order #${order.id} is up to life time.`, order);
    });
  }
}

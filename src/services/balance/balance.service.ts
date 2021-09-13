import { Injectable } from '@nestjs/common';
import { BinanceService } from '../binance/binance.service';
import { OrderStatus, OrderType } from '../order/models/bn-corder';
import { OrderService } from '../order/order.service';

@Injectable()
export class BalanceService {
  constructor(
    private readonly binanceService: BinanceService,
    private readonly orderService: OrderService
  ) { }

  getBalances(
    primaryUsdt: number,
    buyAmount: number,
    leverage: number
  ) {
    const balances = {
      USDT: primaryUsdt
    };
    const { prices } = this.binanceService;
    const { orders } = this.orderService;
    const usdts = {};

    Object.values(orders).forEach(order => {
      const {
        coin,
        price,
        stopLoss,
        type,
        status
      } = order;
      if (!balances[coin]) balances[coin] = 0;
      if (
        status == OrderStatus.active
        || status == OrderStatus.timeout) return;

      if (type == OrderType.buy) {
        balances.USDT -= buyAmount * leverage;
        balances[coin] += buyAmount * leverage / price;
      } else {
        if (status == OrderStatus.processed)
          balances.USDT += balances[coin] * price;
        else
          balances.USDT += balances[coin] * stopLoss;
        balances[coin] = 0;
      }
    });

    let totalBalance = balances.USDT;
    for (const coin in balances) {
      if (coin == 'USDT') continue;
      const price = prices[coin];
      if (!price) continue;
      totalBalance += price * balances[coin];
      usdts[coin] = price * balances[coin];
    }

    return {
      total: totalBalance,
      coins: balances,
      usdts
    };
  }
}

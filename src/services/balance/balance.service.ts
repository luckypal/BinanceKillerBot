import { Injectable } from '@nestjs/common';
import { BinanceService } from '../binance/binance.service';
import { OrderType } from '../order/models/bn-corder';
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

    Object.values(orders).forEach(order => {
      const {
        coin,
        price,
        orderType,
        isActive
      } = order;
      if (!balances[coin]) balances[coin] = 0;
      if (isActive) return;

      if (orderType == OrderType.buy) {
        balances.USDT -= buyAmount * leverage;
        balances[coin] += buyAmount / price;
      } else {
        balances.USDT += balances[coin] * price;
        balances[coin] = 0;
      }
    });

    let totalBalance = balances.USDT;
    for (const coin in balances) {
      if (coin == 'USDT') continue;
      const price = prices[coin];
      if (!price) continue;
      totalBalance += price * balances[coin];
    }

    return {
      total: totalBalance,
      coins: balances,
    };
  }
}

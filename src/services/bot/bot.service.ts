import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MarginOcoOrder, Order, OrderSide, OrderStatus, OrderStatus_LT } from 'binance-api-node';
import { BKSignal } from 'src/models/bk-signal';
import { BncOrder, BncOrderStatus, BncOrderType } from 'src/models/bnc-order';
import { BinanceService } from '../binance/binance.service';
import { LogService } from '../log/log.service';
import { TelegramService } from '../telegram/telegram.service';

interface BotOrder {
  orderId: number;
  symbol: string;
  isIsolated: "TRUE" | "FALSE" | boolean;
  side: OrderSide;
  status: OrderStatus_LT;

  signalId: number | string;
  order: BncOrder;
}

@Injectable()
export class BotService {
  orders: BotOrder[] = [];

  constructor(
    private readonly binanceService: BinanceService,
    private readonly telegramService: TelegramService,
    private readonly logService: LogService
  ) {
    // setTimeout(() => this.startTest(), 10000);
  }

  // async startTest() {
  //   const signal: BKSignal = {
  //     "signalId": 439,
  //     "coin": "DOTUSDT",
  //     "direction": "LONG📈",
  //     "leverage": [
  //       3,
  //       5
  //     ],
  //     "entry": [
  //       26,
  //       27.05
  //     ],
  //     "ote": 26.46,
  //     "terms": {
  //       "short": [
  //         27.4,
  //         27.9,
  //         28.5,
  //         29.4,
  //         30.5
  //       ],
  //       "mid": [
  //         32,
  //         34,
  //         37,
  //         41,
  //         48
  //       ],
  //       "long": []
  //     },
  //     "stopLoss": 23.9,
  //     "createdAt": 1632261411
  //   };

  //   this.onNewSignal(signal);
  // }

  @OnEvent('telegram.onSignal')
  async onNewSignal(signal: BKSignal) {
    this.logService.blog('NEW SIGNAL', signal);
    if (signal.terms.short[0] != Math.min(...signal.terms.short)) {
      this.logService.blog('Falling with margin is not supported yet.');
      return;
    }

    if (signal.dailyStats
      && signal.dailyStats.BTCUSDT < -7) {
      this.logService.blog(`BTC is falling too much now. Daily state: ${signal.dailyStats.BTCUSDT}`);
      return;
    }
    // const leverage = Math.max(...signal.leverage);
    // if (leverage <= 1) return;

    try {
      await this.buy(signal);
    } catch (e) {
      this.logService.blog('ERROR', e);
    }
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  watchOrders() {
    this.orders.forEach(async (order) => {
      try {
        if (order.status != OrderStatus.NEW) return;

        const {
          symbol,
          orderId,
          side
        } = order
        const bnOrder = await this.binanceService.getOrder(symbol, orderId, true);
        if (!bnOrder) return;
        if (bnOrder.status == OrderStatus.NEW
          || bnOrder.status == OrderStatus.PARTIALLY_FILLED) return;

        order.status = bnOrder.status;
        if (order.side == OrderSide.BUY) {
          const {
            executedQty,
            cummulativeQuoteQty,
          } = bnOrder;
          const buyPrice = parseFloat(cummulativeQuoteQty) / parseFloat(executedQty);
          order.order.price = buyPrice;
        }
        order.order.closedAt = Date.now();
        this.logService.blog(`${bnOrder.side} ORDER ${symbol}#${orderId} is ${bnOrder.status}`);

        if (side == OrderSide.BUY) this.sell(order);
        else this.refundToSpot(order);
      } catch (e) {
        this.logService.blog('ERROR', e);
      }
    });
  }

  async amountToUse() {
    const totalAmount = await this.binanceService.getUsdtBalance();
    const amountToUse = Math.floor(totalAmount / 2);
    return amountToUse;
    // if (totalAmount > 10) return 10;
    // else throw 'NOT enough balance';
  }

  async buy(signal: BKSignal): Promise<BotOrder> {
    const {
      signalId,
      coin: symbol,
      leverage
    } = signal;
    const amountToUse = await this.amountToUse();
    const amountToBuy = await this.binanceService.transferSpotToMargin(symbol, amountToUse, 3);
    if (amountToBuy == 0) {
      this.logService.blog(`Not able to transfer from Spot to Margin because of balance short ${amountToUse}`);
      return;
    }

    const leverageLevel = Math.max(...leverage);
    const amountToBuyOrder = Math.min(amountToBuy, amountToUse * leverageLevel);

    this.logService.blog(`SPOT2MARGIN ${symbol}#${signalId} $${amountToUse} x ${leverageLevel} = ${amountToBuy} => ${amountToBuyOrder}`);

    const buyOrder: BncOrder = {
      id: '',
      coin: symbol,
      type: BncOrderType.buy,
      price: 0,
      createdAt: Date.now(),
      signalId,
      leverage: leverageLevel,
      status: BncOrderStatus.active,
    };
    const order = (await this.binanceService.makeOrder(buyOrder, true, amountToBuyOrder)) as Order;
    const { orderId } = order;

    const botOrder: BotOrder = {
      orderId,
      symbol,
      isIsolated: "TRUE",
      side: OrderSide.BUY,
      status: OrderStatus.NEW,

      signalId,
      order: buyOrder
    };
    this.orders.push(botOrder);
    this.logService.blog(`Buy ORDER ${symbol}#${orderId} is created.`, amountToBuy, order);
    return botOrder;
  }

  async sell(buyOrder: BotOrder): Promise<BotOrder> {
    const {
      symbol,
      signalId,
      order: buyBncOrder,
    } = buyOrder;
    const signal = this.telegramService.signals[signalId];
    const {
      leverage,
    } = signal;
    const sellPrice = this.getSellPrice(buyBncOrder);
    const stopLossPrice = this.getStopLossPrice(signal, buyBncOrder.price);

    const amountToSell = await this.binanceService.amountToRepay(symbol);

    const sellOrder: BncOrder = {
      id: '',
      coin: symbol,
      type: BncOrderType.sell,
      price: sellPrice,
      createdAt: Date.now(),
      signalId,
      leverage: Math.max(...leverage),
      status: BncOrderStatus.active,
      stopLoss: stopLossPrice,
    };
    const order = (await this.binanceService.makeOrder(sellOrder, true, amountToSell)) as MarginOcoOrder;
    const { orderId } = order.orderReports[0];

    const botOrder: BotOrder = {
      orderId,
      symbol,
      isIsolated: "TRUE",
      side: OrderSide.SELL,
      status: OrderStatus.NEW,

      signalId,
      order: sellOrder
    };
    this.orders.push(botOrder);
    this.logService.blog(`SELL ORDER ${symbol}#${orderId} is created.`, amountToSell, order);
    return botOrder;
  }

  getSellPrice(buyBncOrder: BncOrder) {
    const { signalId, price } = buyBncOrder;
    const signal = this.telegramService.signals[signalId];
    const { coin, terms } = signal;
    let maxSellPrice = price * 1.03;
    maxSellPrice = Math.min(maxSellPrice, terms.short[0]);
    maxSellPrice = maxSellPrice * 0.9999;
    maxSellPrice = this.binanceService.filterPrice(coin, maxSellPrice);
    return maxSellPrice;
    // const { dailyChangePercent } = this.binanceService;
    // if (dailyChangePercent < 0)
    //   return Math.min(...signal.terms.short, ...signal.terms.mid);
    // return signal.terms.short[1];
  }

  getStopLossPrice(signal: BKSignal, price: number) {
    // const { dailyChangePercent } = this.binanceService;
    // if (dailyChangePercent < 0)
    //   return Math.min(...signal.entry);

    const {
      coin,
      stopLoss,
      leverage,
    } = signal;
    const levLevel = Math.max(...leverage);
    const limit = price * (1 - 1 / levLevel / 2) * 1.01;
    let levStopLoss = Math.max(stopLoss, limit);
    levStopLoss = this.binanceService.filterPrice(coin, levStopLoss);
    return levStopLoss;
  }

  async refundToSpot(sellOrder: BotOrder) {
    const {
      signalId,
      symbol
    } = sellOrder;
    const amountToTransfer = await this.binanceService.transferMarginToSpot(symbol);
    this.logService.blog(`MARGIN2SPOT ${symbol}#${signalId} $${amountToTransfer}`);
  }
}

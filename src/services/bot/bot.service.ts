import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MarginOcoOrder, Order, OrderSide, OrderStatus, OrderStatus_LT } from 'binance-api-node';
import { AppEnvironment } from 'src/app.environment';
import { BKSignal } from 'src/models/bk-signal';
import { BncOrder, BncOrderStatus, BncOrderType } from 'src/models/bnc-order';
import { sleep } from 'src/utils';
import { BinanceService } from '../binance/binance.service';
import { LogService } from '../log/log.service';
import { TelegramService } from '../telegram/telegram.service';
import { NewCoinService } from '../new-coin/new-coin.service';

interface BotOrder {
  orderId: number;
  symbol: string;
  isIsolated: "TRUE" | "FALSE" | boolean;
  side: OrderSide;
  status: OrderStatus_LT;

  signalId: number | string;
  order: BncOrder;
  target?: number;
}

@Injectable()
export class BotService {
  orders: BotOrder[] = [];

  constructor(
    private readonly appEnvironment: AppEnvironment,
    private readonly binanceService: BinanceService,
    private readonly telegramService: TelegramService,
    private readonly newCoinService: NewCoinService,
    private readonly logService: LogService
  ) {
    // setTimeout(() => this.startTest(), 10000);
  }

  // async startTest() { }

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

    const { coin } = signal;
    const { coinExceptions } = this.appEnvironment;
    if (coinExceptions.indexOf(coin) != -1) {
      this.logService.blog(`${coin} is in Exceptional list.`);
      return;
    }

    try {
      await this.buy(signal);
    } catch (e) {
      this.logService.blog('ERROR', e);
    }
  }

  @OnEvent('binance.onUpdatePrices')
  onUpdatePrices(prices: Record<string, number>) {
    const { signals } = this.telegramService;

    this.orders
      .filter((order) => (order.status == OrderStatus.NEW))
      .forEach(async (order) => {
        const {
          signalId,
          symbol,
          target = 0 } = order;
        const price = prices[symbol];
        const {
          terms } = signals[signalId];
        const targets = [
          ...terms.short,
          ...terms.mid,
          ...terms.long
        ];
        if (target == targets.length - 1) return;
        if (targets[target] <= price) {
          order.status = OrderStatus.CANCELED;
          this.updateSellOrderTarget(order, target);
        }
      })
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
    const { ratioTradeOnce } = this.appEnvironment;
    let useAmount = totalAmount * ratioTradeOnce;
    if (ratioTradeOnce > 1) useAmount = Math.min(ratioTradeOnce, totalAmount);
    if (this.newCoinService.hasNewCoin()) useAmount = useAmount / 2;

    return Math.floor(useAmount);
    // if (totalAmount > 10) return 10;
    // else throw 'NOT enough balance';
  }

  async buy(signal: BKSignal): Promise<BotOrder> {
    const {
      signalId,
      coin: symbol,
      leverage
    } = signal;
    if (!this.appEnvironment.useOffset) await sleep(2000);
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
    // const sellPrice = this.getSellPrice(buyBncOrder);
    const sellPrice = this.getMaxSellPrice(buyBncOrder);
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
      order: sellOrder,
      target: 0
    };
    this.orders.push(botOrder);
    this.logService.blog(`SELL ORDER ${symbol}#${orderId} is created.`, amountToSell, order);
    return botOrder;
  }

  async updateSellOrderTarget(orgOrder: BotOrder, target: number) {
    const { signals } = this.telegramService;
    const {
      orderId,
      signalId,
      symbol } = orgOrder;
    const {
      leverage,
      entry,
      terms } = signals[signalId];
    const targets = [
      ...terms.short,
      ...terms.mid,
      ...terms.long
    ];

    const cancelResult = await this.binanceService.cancelOrder(symbol, orderId);
    this.logService.blog('Order cancel Result', cancelResult);

    const sellPrice = Math.max(...targets);
    const minTarget = (Math.max(...entry) + targets[0]) / 2;
    const newStopLoss = target == 0 ? minTarget : targets[target - 1];
    const stopLossPrice = this.binanceService.filterPrice(symbol, newStopLoss);
    this.logService.blog(`SELL ORDER ${symbol}#${orderId} is removed to update stop loss.`, stopLossPrice);

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
    const newSellOrder = (await this.binanceService.makeOrder(sellOrder, true, amountToSell)) as MarginOcoOrder;
    const { orderId: newOrderId } = newSellOrder.orderReports[0];

    const botOrder: BotOrder = {
      orderId: newOrderId,
      symbol,
      isIsolated: "TRUE",
      side: OrderSide.SELL,
      status: OrderStatus.NEW,

      signalId,
      order: sellOrder,
      target: target + 1
    };
    this.orders.push(botOrder);
    this.logService.blog(`SELL ORDER ${symbol}#${newOrderId} is recreated.`, amountToSell, newSellOrder);
  }

  getSellPrice(buyBncOrder: BncOrder) {
    const { signalId, price } = buyBncOrder;
    const signal = this.telegramService.signals[signalId];
    const { coin, terms } = signal;
    let maxSellPrice = price * 1.03;
    maxSellPrice = Math.min(maxSellPrice, terms.short[0]);
    if (this.appEnvironment.useOffset) {
      maxSellPrice = maxSellPrice * 0.9999;
    }
    maxSellPrice = this.binanceService.filterPrice(coin, maxSellPrice);
    return maxSellPrice;
    // const { dailyChangePercent } = this.binanceService;
    // if (dailyChangePercent < 0)
    //   return Math.min(...signal.terms.short, ...signal.terms.mid);
    // return signal.terms.short[1];
  }

  getMaxSellPrice(buyBncOrder: BncOrder) {
    const { signalId } = buyBncOrder;
    const signal = this.telegramService.signals[signalId];
    const { terms } = signal;

    const targets = [
      ...terms.short,
      ...terms.mid,
      ...terms.long
    ];
    return Math.max(...targets);
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
    let limit = price * (1 - 1 / levLevel / 2) * 1.01;
    if (!this.appEnvironment.useOffset) limit *= 1.001;
    let levStopLoss = Math.max(stopLoss, limit);
    levStopLoss = this.binanceService.filterPrice(coin, levStopLoss);
    return levStopLoss;
  }

  async refundToSpot(sellOrder: BotOrder) {
    const {
      signalId,
      symbol
    } = sellOrder;
    await sleep(5000);
    const amountToTransfer = await this.binanceService.transferMarginToSpot(symbol);
    this.logService.blog(`MARGIN2SPOT ${symbol}#${signalId} $${amountToTransfer.quote}, #${amountToTransfer.base}`);
  }
}

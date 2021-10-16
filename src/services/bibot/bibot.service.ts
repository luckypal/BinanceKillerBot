import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MarginOcoOrder, Order, OrderSide, OrderStatus } from 'binance-api-node';
import { AppEnvironment } from 'src/app.environment';
import { TradingPair } from 'src/models/bi-order';
import { BIDirection, BISignal } from 'src/models/bi-signal';
import { BncOrder, BncOrderStatus, BncOrderType, BotOrder } from 'src/models/bnc-order';
import { sleep } from 'src/utils';
import { BinanceService } from '../binance/binance.service';
import { LogService } from '../log/log.service';

/**
 * Binance Indicator Bot
 */
@Injectable()
export class BibotService {
  orders: BotOrder[] = [];
  activePairs: TradingPair[] = [];

  constructor(
    private readonly appEnvironment: AppEnvironment,
    private readonly logService: LogService,
    private readonly binanceService: BinanceService,
  ) {
    // setTimeout(() => this.startTest(), 5000);
  }

  @OnEvent('bibot.onSignal')
  onNewSignal(signals: BISignal[]) {
    this.logService.bilog(signals);

    signals.forEach(signal => this.processSignal(signal));
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  watchOrders() {
    this.orders.forEach(async (order) => {
      try {
        if (order.status != OrderStatus.NEW) return;

        const {
          symbol,
          orderId,
          side,
        } = order
        const bnOrder = await this.binanceService.getOrder(symbol, orderId, true);
        if (!bnOrder) return;

        if (bnOrder.status == OrderStatus.NEW
          || bnOrder.status == OrderStatus.PARTIALLY_FILLED) return;

        order.status = bnOrder.status;
        order.order.closedAt = Date.now();
        this.logService.bilog(`${bnOrder.side} ORDER ${symbol}#${orderId} is ${bnOrder.status}`);

        if (side == OrderSide.BUY) this.sell(order);
        else {
          this.removeOrder(symbol);
          this.refundToSpot(order);
        }
      } catch (e) {
        this.logService.bilog('ERROR', e);
      }
    });
  }

  async processSignal(signal: BISignal) {
    const { biRankLimit } = this.appEnvironment;
    const {
      direction,
      rank
    } = signal;

    // Check under rank signal
    if (rank > biRankLimit && direction === BIDirection.LONG) return;

    if (direction == BIDirection.LONG) this.buy(signal);
    else this.forceSell(signal);
  }

  async buy(signal: BISignal) {
    const {
      biLeverage,
      useOffset } = this.appEnvironment;
    const {
      id: signalId,
      symbol,
      price,
    } = signal;

    if (!useOffset) await sleep(2000);
    const amountToUse = await this.amountToUse();
    let amountToBuy = 0;

    try {
      amountToBuy = await this.binanceService.transferSpotToMargin(symbol, amountToUse, 3);
    } catch (e) {
      console.log(e);
      try {
        await this.removeLastPair(symbol);
        amountToBuy = await this.binanceService.transferSpotToMargin(symbol, amountToUse, 3);
      } catch (e) {
        this.logService.bilog('Can not open margin trading pair', signalId, symbol);
        return;
      }
    }

    this.addTradingPair(symbol);
    const amountToBuyOrder = Math.min(amountToBuy, amountToUse * biLeverage);

    this.logService.bilog(`SPOT2MARGIN ${symbol}#${signalId} $${amountToUse} x ${biLeverage} = ${amountToBuy} => ${amountToBuyOrder}`);
    const buyOrder: BncOrder = {
      id: '',
      coin: symbol,
      type: BncOrderType.buy,
      price: parseFloat(price),
      createdAt: Date.now(),
      signalId,
      leverage: biLeverage,
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
      order: buyOrder,
    };
    this.orders.push(botOrder);
    this.logService.bilog(`Buy ORDER ${symbol}#${orderId} is created.`, amountToBuy, order);
    return botOrder;
  }

  async sell(buyOrder: BotOrder): Promise<BotOrder> {
    const {
      symbol,
      signalId,
      order: buyBncOrder,
    } = buyOrder;
    const { biLeverage } = this.appEnvironment;

    const buyPrice = buyBncOrder.price;
    const sellPrice = buyPrice * 1.01;

    const stopLossPrice = this.binanceService.filterPrice(symbol, buyPrice * 0.91);
    const amountToSell = await this.binanceService.amountToRepay(symbol);

    const sellOrder: BncOrder = {
      id: '',
      coin: symbol,
      type: BncOrderType.sell,
      price: sellPrice,
      createdAt: Date.now(),
      signalId,
      leverage: biLeverage,
      status: BncOrderStatus.active,
      stopLoss: stopLossPrice,
    };
    const order = (await this.binanceService.makeOrder(sellOrder, false, amountToSell)) as MarginOcoOrder;
    const { orderId } = order.orderReports[0];

    const botOrder: BotOrder = {
      orderId,
      symbol,
      isIsolated: "TRUE",
      side: OrderSide.SELL,
      status: OrderStatus.NEW,

      signalId,
      order: sellOrder,
      target: 0,
    };
    this.orders.push(botOrder);
    this.logService.bilog(`SELL ORDER ${symbol}#${orderId} is created.`, amountToSell, order);
    return botOrder;
  }

  async forceSell(signal: BISignal) {
    const { biLeverage } = this.appEnvironment;
    const {
      id: signalId,
      symbol,
      price } = signal;
    const sellPrice = parseFloat(price);
    const sellOrders = this.orders.filter(order => order.symbol == symbol && order.side == OrderSide.SELL);

    this.logService.bilog(`SELL ORDERS are cancelled.`, sellOrders.map(order => order.orderId).join(','));

    await Promise.all(
      sellOrders.map(({ orderId }) => this.binanceService.cancelOrder(symbol, orderId))
    );
    await sleep(1000);
    const amountToSell = await this.binanceService.amountToRepay(symbol);

    const sellOrder: BncOrder = {
      id: '',
      coin: symbol,
      type: BncOrderType.sell,
      price: sellPrice,
      createdAt: Date.now(),
      signalId,
      leverage: biLeverage,
      status: BncOrderStatus.active,
      stopLoss: 0,
    };
    const order = (await this.binanceService.makeOrder(sellOrder, true, amountToSell)) as MarginOcoOrder;
    const { orderId } = order.orderReports[0];
    this.logService.bilog(`MARKET SELL ORDER ${symbol}#${orderId} is created.`, amountToSell, order);
    this.removeOrder(symbol);

    const botOrder: BotOrder = {
      orderId,
      symbol,
      isIsolated: "TRUE",
      side: OrderSide.SELL,
      status: OrderStatus.NEW,

      signalId,
      order: sellOrder,
      target: 0,
    };
    this.orders.push(botOrder);
  }

  removeOrder(symbol) {
    this.orders = this.orders.filter(order => order.symbol != symbol);
  }

  async amountToUse() {
    const totalAmount = await this.binanceService.getUsdtBalance();
    const ratioTradeOnce = 100;
    let useAmount = totalAmount * ratioTradeOnce;
    if (ratioTradeOnce > 1) useAmount = Math.min(ratioTradeOnce, totalAmount);

    return Math.floor(useAmount);
  }

  isActivePair(symbol: string) {
    return this.activePairs.findIndex((pair) => pair.symbol == symbol) > -1;
  }

  addTradingPair(symbol: string) {
    if (this.isActivePair(symbol)) {
      this.updateTradingPair(symbol);
      return;
    }

    this.activePairs.push({
      symbol,
      lastUsedAt: Date.now()
    });
  }

  updateTradingPair(symbol: string) {
    const index = this.activePairs.findIndex((pair) => pair.symbol == symbol);
    if (index == -1) return;
    this.activePairs[index].lastUsedAt = Date.now();
  }

  async removeLastPair(neededSymbol: string) {
    const len = this.activePairs.length;
    this.activePairs.sort((a, b) => {
      if (a.lastUsedAt < b.lastUsedAt) return 1;
      if (a.lastUsedAt == b.lastUsedAt) return 0;
      return -1;
    });

    let lastPair = this.activePairs[len - 1];
    if (lastPair.symbol == neededSymbol) lastPair = this.activePairs[len - 2];

    try {
      await this.binanceService.binance.disableMarginAccount({ symbol: lastPair.symbol });
    } catch (e) {
      this.logService.bilog('Can not close margin trading pair', lastPair.symbol);
      throw e;
    }
  }

  async refundToSpot(sellOrder: BotOrder) {
    const {
      signalId,
      symbol
    } = sellOrder;
    await sleep(5000);
    const amountToTransfer = await this.binanceService.transferMarginToSpot(symbol, false);
    this.logService.bilog(`MARGIN2SPOT ${symbol}#${signalId} $${amountToTransfer.quote}, #${amountToTransfer.base}`);
  }
}

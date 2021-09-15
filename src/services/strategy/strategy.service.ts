import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { BaseStrategy, OrderProperty } from 'src/libs/strategy/base-strategy';
import { BinanceService } from '../binance/binance.service';
import { LogService } from '../log/log.service';
import { BKSignal } from '../order/models/bk-signal';

@Injectable()
export class StrategyService {
  strategyProps: string[][] = [];
  strategyKeys: string[] = [];
  strategies: BaseStrategy[] = [];

  constructor(
    private readonly logService: LogService,
    private readonly binanceService: BinanceService
  ) { }


  combineProps(prevKey, propIndex): string[] {
    if (propIndex == this.strategyProps.length - 1) {
      return this.strategyProps[propIndex].map(prop => (`${prevKey}-${prop}`))
    }

    const keys = [];
    this.strategyProps[propIndex].forEach(prop => {
      const newKey = propIndex == 0 ? prop : `${prevKey}-${prop}`;
      const newKeys = this.combineProps(newKey, propIndex + 1);
      keys.push(...newKeys);
    });
    return keys;
  }

  createStrategy() {
    this.strategyProps = [
      [
        "urgent",
        "ote",
        "min"
      ],
      [
        "shortest",
        "shortmax",
      ],
      [
        "highleverage",
        "normalleverage",
        "noleverage"
      ]
    ];

    this.strategyKeys = this.combineProps('', 0);
    console.log(this.strategyKeys);

    this.strategyKeys.forEach(method => {
      const property: OrderProperty = {};

      if (method.indexOf('urgent') >= 0) property.getBuyPrice = (signal, price) => price;
      if (method.indexOf('ote') >= 0) property.getBuyPrice = (signal, price) => signal.ote;
      if (method.indexOf('min') >= 0) property.getBuyPrice = (signal, price) => Math.min(...signal.entry);

      if (method.indexOf('shortest') >= 0) property.getSellPrice = (signal) => signal.terms.short[0];
      if (method.indexOf('shortmax') >= 0) property.getSellPrice = (signal) => signal.terms.short[signal.terms.short.length - 1];

      if (method.indexOf('highleverage') >= 0) property.getLeverage = (signal) => signal.terms.short[signal.terms.short.length - 1];
      if (method.indexOf('normalleverage') >= 0) property.getLeverage = (signal) => signal.leverage[0];
      if (method.indexOf('noleverage') >= 0) property.getLeverage = (signal) => 1;

      this.strategies.push(
        new BaseStrategy(
          method,
          property,
          this.logService,
          this.binanceService
        )
      );
    });
  }

  @OnEvent('telegram.onSignal')
  onNewSignal(signal: BKSignal) {
    this.strategies.forEach(strategy => strategy.onNewSignal(signal));
  }

  @OnEvent('binance.onUpdatePrices')
  onUpdatePrices(prices: Record<string, number>) {
    this.strategies.forEach(strategy => strategy.onUpdatePrices(prices));
  }
}

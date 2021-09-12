import { BKSignal } from "./bk-signal";

export enum OrderType {
  buy = 0,
  sell = 1,
}

export interface BncOrder {
  id: number;

  refOrderId?: number;

  signalId: number;

  signal: BKSignal;

  coin: string;

  orderType: OrderType;

  price: number;

  // amount: number; // Buy: USDT, Sell: Coin

  stopLoss?: number;

  lifeTime: number;

  leverage: number;

  isActive: boolean;
}
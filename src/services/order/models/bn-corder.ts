import { BKSignal } from "./bk-signal";

export enum OrderType {
  buy = 0,
  sell = 1,
}

export enum OrderStatus {
  active = 0,

  processed = 1,

  stopLess = 2,

  timeout = 3
}

export interface BncOrder {
  id: number;

  refOrderId?: number;

  signalId: number;

  signal: BKSignal;

  coin: string;

  type: OrderType;

  price: number;

  // amount: number; // Buy: USDT, Sell: Coin

  stopLoss?: number;

  lifeTime: number;

  leverage: number;

  status: OrderStatus;
}
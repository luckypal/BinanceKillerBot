import { BKSignal } from "./bk-signal";

export enum OrderStatus {
  buy = 0,
  sell = 1,
}

export interface BncOrder {
  id: number;

  refOrderId?: number;

  signalId: number;

  signal: BKSignal;

  coin: string;

  orderStatus: OrderStatus;

  price: number;

  stopLoss?: number;

  lifeTime: number;

  leverage: number;

  isActive: boolean;
}
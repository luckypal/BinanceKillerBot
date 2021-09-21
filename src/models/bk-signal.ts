export interface BKSignalTerms {
  short: number[];

  mid: number[];

  long: number[];
}

export interface BKSignal {
  signalId: number;

  coin: string;

  direction: string;

  leverage: number[];

  entry: number[];

  ote: number;

  terms: BKSignalTerms;

  stopLoss: number;

  createdAt: number;
}

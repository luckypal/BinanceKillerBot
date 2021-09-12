export interface BKSignalTerms {
  short: number[];

  mid: number[];

  long: number[];
}

export interface BKSignal {
  signalId: number;

  coin: string;

  leverage: string[];

  entry: number[];

  ote: number;

  terms: BKSignalTerms;

  stopLoss: number;
}

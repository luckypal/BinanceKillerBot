import { Injectable } from '@nestjs/common';

export interface Log {
  data,
  createdAt: Date
}

@Injectable()
export class LogService {
  logs: Log[] = [];

  log(...msg) {
    console.log(new Date(), ...msg);

    this.logs.push({
      data: msg,
      createdAt: new Date()
    })
  }
}

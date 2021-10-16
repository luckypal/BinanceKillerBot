import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { BIDirection, BISignal } from 'src/models/bi-signal';

/**
 * Binance Indicator Bot
 */
@Injectable()
export class BibotService {

  @OnEvent('bibot.onSignal')
  onNewSignal(signals: BISignal[]) {
    console.log(signals);
  }
}

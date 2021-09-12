import { Injectable } from '@nestjs/common';
import * as MTProto from '@mtproto/core';
import * as prompts from 'prompts';
import { AppEnvironment } from 'src/app.environment';
import { OrderService } from '../order/order.service';
import { BKSignal, BKSignalTerms } from '../order/models/bk-signal';
import { LogService } from '../log/log.service';

@Injectable()
export class TelegramService {
  mtproto: MTProto;

  constructor(
    private appEnvironment: AppEnvironment,
    private orderService: OrderService,
    private logService: LogService
  ) {
    this.mtproto = new MTProto({
      api_id: this.appEnvironment.tgAppId,
      api_hash: this.appEnvironment.tgApiHash,

      storageOptions: {
        path: './data/tg.json',
      },
    });
    this.mtproto.setDefaultDc(this.appEnvironment.tgDcId);
  }

  async getPhone() {
    return (await prompts({
      type: 'text',
      name: 'phone',
      message: 'Enter your phone number:'
    })).phone
  }

  async getCode() {
    // you can implement your code fetching strategy here
    return (await prompts({
      type: 'text',
      name: 'code',
      message: 'Enter the code sent:',
    })).code
  }

  async getPassword() {
    return (await prompts({
      type: 'text',
      name: 'password',
      message: 'Enter Password:',
    })).password
  }

  async startAuth(phone_number) {

    console.log('[+] You must log in')
    if (!phone_number) phone_number = await this.getPhone()

    this.mtproto.call('auth.sendCode', {
      phone_number: phone_number,
      settings: {
        _: 'codeSettings',
      },
    })
      .catch(error => {
        console.log('SEND CODE ERROR', error);
        if (error.error_message.includes('_MIGRATE_')) {
          const [type, nextDcId] = error.error_message.split('_MIGRATE_');

          this.mtproto.setDefaultDc(+nextDcId);

          return this.mtproto.call('auth.sendCode', {
            phone_number: phone_number,
            settings: {
              _: 'codeSettings',
            },
          })
        }
      })
      .then(async result => {
        console.log('Send Code', result)
        return this.mtproto.call('auth.signIn', {
          phone_code: await this.getCode(),
          phone_number: phone_number,
          phone_code_hash: result.phone_code_hash,
        });
      })
      .catch(error => {
        console.log('auth.signIn ERROR', error);
      })
      .then(result => {
        console.log('[+] successfully authenticated', result);
        // start listener since the user has logged in now
        this.startListener()
      });
  }


  isDowning(data) {
    const { terms } = data;
    return terms.short[0] > terms.short[1];
  }

  startListener = () => {
    console.log('[+] starting listener')
    this.mtproto.updates.on('updates', ({ updates }) => {
      const newChannelMessages = updates.filter((update) => update._ === 'updateNewChannelMessage').map(({ message }) => message) // filter `updateNewChannelMessage` types only and extract the 'message' object

      if (newChannelMessages.length == 0) return;
      const message = newChannelMessages[0];
      if (!message) return;

      const { peer_id: { channel_id = 0 } = {} } = message;
      if (channel_id != this.appEnvironment.tgChannelId) return;

      try {
        // processMessage(message);
      } catch (e) {
        this.logService.log('PROCESSING MESSAGE ERROR', e);
      }
    });
    // bindEvents();
  }

  strReplace(str, source, target) {
    source.forEach(src => str = str.replace(src, target));
    return str;
  }

  parseSignalId(line) {
    if (!line.startsWith('📍')) return null;
    const id = line.replace(/📍/g, '').trim().replace('SIGNAL ID:', '');
    return parseInt(id);
  }

  /**
   * Parse coin
   * sample line: COIN: $FIL/USDT (3-5x)
   * sample return: { coin: 'FIL/USDT', leverage: [3, 5] }
   * @param {String} line 
   * @returns 
   */
  parseCoin(line) {
    const msgs = line.split(' ');
    if (msgs[0] != 'COIN:') return null;
    const coin = this.strReplace(msgs[1], ['$', '/'], '');
    const leverage = this.splitValues(this.strReplace(msgs[2], ['(', 'x', ')'], ''));
    return {
      coin,
      leverage
    }
  }

  findLine(lines, key) {
    for (const line of lines) {
      if (line.indexOf(key) == 0)
        return line.replace(key, '').trim();
    }
    return null;
  }

  /**
   * Parse Entry
   * sample input: ENTRY: 81 - 84.5
   * sample output: [81, 84.5]
   * @param {String} lines 
   * @returns 
   */
  parseEntry(lines) {
    const value = this.findLine(lines, 'ENTRY:');
    if (!value) throw 'ENTRY NOT FOUND';
    const values = value.split('-');
    return values.map(v => parseFloat(v));
  }

  parseOTE(lines) {
    const value = this.findLine(lines, 'OTE:');
    if (!value) throw 'OTE NOT FOUND';
    return parseFloat(value);
  }

  parseStopLoss(lines) {
    const value = this.findLine(lines, 'STOP LOSS:');
    if (!value) throw 'STOP LOSS NOT FOUND';
    return parseFloat(value);
  }

  splitValues(values) {
    if (!values) return [];
    return values.split('-').map(v => (parseFloat(v.trim())));
  }

  parseTerms(lines): BKSignalTerms {
    const short = this.findLine(lines, 'Short Term:');
    const mid = this.findLine(lines, 'Mid Term:');
    const long = this.findLine(lines, 'Long Term:');
    return {
      short: this.splitValues(short),
      mid: this.splitValues(mid),
      long: this.splitValues(long)
    };
  }

  processMessage(message) {
    const { reply_to = null, message: msgContent, date } = message;
    if (reply_to) return;

    const msgLines = msgContent.split('\n');
    if (msgLines[0].indexOf('SIGNAL ID:') == -1) return;

    // New signal is incomed.
    [0, 1, 2].forEach(index => this.logService.log(msgLines[index]));

    const signalId = this.parseSignalId(msgLines[0]);
    const { coin, leverage } = this.parseCoin(msgLines[1]);
    const entry = this.parseEntry(msgLines);
    const ote = this.parseOTE(msgLines);
    const terms = this.parseTerms(msgLines);
    const stopLoss = this.parseStopLoss(msgLines);

    const signalData: BKSignal = {
      signalId,
      coin,
      leverage,
      entry,
      ote,
      terms,
      stopLoss
    };

    this.orderService.onNewSignal(signalData);

    return signalData;
  }
}

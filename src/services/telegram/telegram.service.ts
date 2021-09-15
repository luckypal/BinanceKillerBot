import { Injectable } from '@nestjs/common';
import * as MTProto from '@mtproto/core';
import * as prompts from 'prompts';
import { AppEnvironment } from 'src/app.environment';
import { BKSignal, BKSignalTerms } from '../../models/bk-signal';
import { LogService } from '../log/log.service';
import { EventEmitter2 } from 'eventemitter2';

@Injectable()
export class TelegramService {
  mtproto: MTProto;
  phoneCodeHash: string;

  private _signals: Record<number, BKSignal> = {};

  constructor(
    private eventEmitter: EventEmitter2,
    private readonly logService: LogService,
    private readonly appEnvironment: AppEnvironment,
  ) { }

  start() {
    this.mtproto = new MTProto({
      api_id: this.appEnvironment.tgAppId,
      api_hash: this.appEnvironment.tgApiHash,

      storageOptions: {
        path: './data/tgAuth.json',
      },
    });
    this.mtproto.setDefaultDc(this.appEnvironment.tgDcId);


    this.mtproto
      .call('users.getFullUser', {
        id: {
          _: 'inputUserSelf',
        },
      })
      .then((result) => {
        console.log('Telegram GetFull User', result)
        this.startListener();
      })
      .catch(error => {
        console.log('Telegram Error', error)
        this.startAuth(this.appEnvironment.phoneNumber);
      })

    // const isProcess = true;
    const isProcess = false;
    if (isProcess) {
      this.processMessage({
        peer_id: { _: 'peerChannel', channel_id: 1178421859 },
        date: 1631370197,
        message: '📍SIGNAL ID: 0424📍\n' +
          'COIN: $FIL/USDT (3-5x)\n' +
          'Direction: LONG📈\n' +
          '➖➖➖➖➖➖➖\n' +
          "Broke out of its descending trend-line and confirmed one of our most important mid term fibs as support, we're in for a ride Killers😘\n" +
          '\n' +
          'ENTRY: 81 - 84.5\n' +
          'OTE: 82.77\n' +
          '\n' +
          'TARGETS\n' +
          'Short Term: 85.50 - 86.5 - 88 - 90\n' +
          'Mid Term: 94 - 100 - 110 - 120\n' +
          'Long Term: 135 - 150\n' +
          '\n' +
          'STOP LOSS: 75.67\n' +
          '➖➖➖➖➖➖➖\n' +
          'This message cannot be forwarded or replicated\n' +
          '- Binance Killers®',
      });
    }
  }

  get signals() {
    return this._signals;
  }

  set signals(data) {
    this._signals = data;
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
    // if (!phone_number) phone_number = await this.getPhone()

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
        this.phoneCodeHash = result.phone_code_hash;
      })
  }

  async verifyCode(code) {
    this.mtproto.call('auth.signIn', {
      phone_code: code,
      phone_number: this.appEnvironment.phoneNumber,
      phone_code_hash: this.phoneCodeHash,
    }).then(result => {
      console.log('[+] successfully authenticated', result);
      // start listener since the user has logged in now
      this.startListener()
    }).catch(error => {
      console.log('auth.signIn ERROR', error);
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
      console.log('TG UPDATES', message);
      if (!message) return;

      const { peer_id: { channel_id = 0 } = {} } = message;
      if (channel_id != this.appEnvironment.tgChannelId) return;

      try {
        this.processMessage(message);
      } catch (e) {
        this.logService.log('PROCESSING MESSAGE ERROR', e);
      }
    });
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
    let leverage = this.splitValues(this.strReplace(msgs[2], ['(', 'x', ')'], ''));
    if (leverage.length == 0) leverage = [1];

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
      stopLoss,
      createdAt: date
    };

    this.eventEmitter.emit('telegram.onSignal', signalData);
    this._signals[signalId] = signalData;

    return signalData;
  }
}

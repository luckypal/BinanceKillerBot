import { Injectable } from '@nestjs/common';
import * as MTProto from '@mtproto/core';
import * as prompts from 'prompts';
import { AppEnvironment } from 'src/app.environment';

@Injectable()
export class TelegramService {
  mtproto: MTProto;

  constructor(
    private appEnvironment: AppEnvironment
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
        this.log('PROCESSING MESSAGE ERROR', e);
      }
    });
    // bindEvents();
  }

  log(...msg) {
    console.log(new Date(), ...msg);
  }
}

import * as fs from 'fs';
import * as moment from 'moment';
import { Injectable } from '@nestjs/common';
import { AppEnvironment } from 'src/app.environment';

export interface Log {
  data,
  createdAt: Date
}

@Injectable()
export class LogService {
  filePath = '';
  bFilePath = '';
  mFilePath = '';

  constructor(
    private readonly appEnvironment: AppEnvironment
  ) {
    const { logFileDir } = this.appEnvironment;
    this.filePath = `${logFileDir}/logs.txt`;
    this.bFilePath = `${logFileDir}/bot_logs.txt`;
    this.mFilePath = `${logFileDir}/msg_logs.txt`;
  }

  getMessage(msg) {
    const date = moment().utcOffset(-5).format('YYYY-MM-DD HH:mm:ss');

    const messages = msg.map(value => {
      if (typeof value === 'string') return value;
      if (typeof value === 'object') return JSON.stringify(value);
      return value;
    }).join('  |  ');
    const data = `${date}  ${messages}\n`;
    return data;
  }

  log(...msg) {
    const data = this.getMessage(msg);
    fs.appendFileSync(this.filePath, data, { encoding: 'utf8' });
  }

  blog(...msg) {
    const data = this.getMessage(msg);
    fs.appendFileSync(this.bFilePath, data, { encoding: 'utf8' });
  }

  mlog(...msg) {
    const data = this.getMessage(msg);
    fs.appendFileSync(this.mFilePath, data, { encoding: 'utf8' });
  }

  streamLog(filePath, res) {
    if (!fs.existsSync(filePath)) {
      fs.appendFileSync(filePath, '', { encoding: 'utf8' });
    }

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  }
}

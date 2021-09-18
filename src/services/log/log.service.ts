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

  constructor(
    private readonly appEnvironment: AppEnvironment
  ) {
    const { logFileDir } = this.appEnvironment;
    this.filePath = `${logFileDir}/logs.txt`;
  }

  log(...msg) {
    const date = moment().utcOffset(-5).format('YYYY-MM-DD HH:mm:ss');
    console.log(date, ...msg);

    const messages = msg.map(value => {
      if (typeof value === 'string') return value;
      if (typeof value === 'object') return JSON.stringify(value);
    }).join('  |  ');
    const data = `${date}  ${messages}\n`;
    fs.appendFileSync(this.filePath, data, { encoding: 'utf8' });
  }
}

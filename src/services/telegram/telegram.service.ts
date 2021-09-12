import { Injectable } from '@nestjs/common';
import { AppEnvironment } from 'src/app.environment';

@Injectable()
export class TelegramService {
  constructor(
    private appEnvironment: AppEnvironment
  ) {
  }
}

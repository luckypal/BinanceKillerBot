import { Body, Controller, Get, Post } from '@nestjs/common';
import { AppEnvironment } from 'src/app.environment';

import { BinanceService } from 'src/services/binance/binance.service';
import { NewsService } from 'src/services/news/news.service';

@Controller('api')
export class ApiController {
  constructor(
    private appEnvironment: AppEnvironment,
    private readonly binanceService: BinanceService,
    private readonly newsService: NewsService,
  ) { }

  @Get('symbols')
  getSymbols() {
    return Object.keys(this.binanceService.prices)
      .filter(symbol => symbol.endsWith('USDT'));
  }

  @Get('news')
  getNews() {
    return this.newsService.data;
  }

  @Post('auth')
  auth(@Body() { secretKey }: { secretKey: string }) {
    const { frontendSecKey } = this.appEnvironment;
    return {
      result: secretKey === frontendSecKey
    };
  }
}

import { Body, Controller, Get, Post } from '@nestjs/common';
import { AppEnvironment } from 'src/app.environment';
import { News, NewsSource } from 'src/models/news';

import { BinanceService } from 'src/services/binance/binance.service';
import { NewCoinService } from 'src/services/new-coin/new-coin.service';
import { NewsService } from 'src/services/news/news.service';

@Controller('api')
export class ApiController {
  constructor(
    private appEnvironment: AppEnvironment,
    private readonly binanceService: BinanceService,
    private readonly newsService: NewsService,
    private readonly newCoinService: NewCoinService,
  ) { }

  @Get('symbols')
  getSymbols() {
    return Object.keys(this.binanceService.prices)
      .filter(symbol => symbol.endsWith('USDT'));
  }

  @Get('news')
  getNews() {
    const newCoins = this.newCoinService.data.filter(({ isExist }) => !isExist).map(({ symbol }) => symbol).join(', ');
    return [
      ...this.newsService.data,
      {
        id: 'NewCoin',
        title: `NEW: ${newCoins}`,
        from: NewsSource.Binance,
        data: [],
        createdAt: Date.now(),
      }
    ] as News[];
  }

  @Post('auth')
  auth(@Body() { secretKey }: { secretKey: string }) {
    const { frontendSecKey } = this.appEnvironment;
    return {
      result: secretKey === frontendSecKey
    };
  }
}

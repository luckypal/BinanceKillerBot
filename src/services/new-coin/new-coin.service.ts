import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios from 'axios';
import { NewCoin } from 'src/models/new-coin';
import { BinanceArticle } from 'src/models/news';
import { BinanceService } from '../binance/binance.service';

@Injectable()
export class NewCoinService {
  data: NewCoin[] = [];

  URL_BINANCE_ARTICLE = 'https://www.binance.com/bapi/composite/v1/public/cms/article/catalog/list/query?catalogId=48&pageNo=1&pageSize=100';

  constructor(
    private readonly binanceService: BinanceService
  ) { }

  start() {
    this.getBinanceArticle();
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  getBinanceArticle() {
    axios.get(this.URL_BINANCE_ARTICLE)
      .then(({ data: { data: { articles } } }: { data: { data: { articles: BinanceArticle[] } } }) => {
        this.checkNewCoins(articles);
      });
  }

  checkNewCoins(articles: BinanceArticle[]) {
    articles.forEach(article => {
      const { title } = article;
      const foundTitle = title.match(/\([A-Z0-9]{3,10}\)/);
      if (!foundTitle) return;
      let symbol = foundTitle[0].replace(/\(|\)/g, '')
      symbol = `${symbol}USDT`;
      this.addNewCoin(symbol);
    });
  }

  addNewCoin(newCoin: string) {
    const isFound = this.data.find(({ symbol }) => (symbol == newCoin));
    if (isFound) return;

    const isExist = this.binanceService.prices[newCoin]
    this.data.push({
      symbol: newCoin,
      isExist: !!isExist,
      createdAt: Date.now()
    });
  }
}

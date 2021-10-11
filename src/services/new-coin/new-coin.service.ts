import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios from 'axios';
import { EventEmitter2 } from 'eventemitter2';
import { NewCoin } from 'src/models/new-coin';
import { BinanceArticle } from 'src/models/news';
import { BinanceService } from '../binance/binance.service';

@Injectable()
export class NewCoinService {
  data: NewCoin[] = [];

  URL_BINANCE_ARTICLE = 'https://www.binance.com/bapi/composite/v1/public/cms/article/catalog/list/query?catalogId=48&pageNo=1&pageSize=15';

  constructor(
    private readonly binanceService: BinanceService,
    private eventEmitter: EventEmitter2,
  ) { }

  start() {
    setTimeout(() => {
      this.getBinanceArticle();
    }, 5000);
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  getBinanceArticle() {
    axios.get(this.URL_BINANCE_ARTICLE)
      .then(({ data: { data: { articles } } }: { data: { data: { articles: BinanceArticle[] } } }) => {
        this.checkNewCoins(articles);
      });
  }

  @Cron('59 59 * * * *')
  buyNewCoin0() {
    this.buyNewCoin();
  }

  @Cron('59 29 * * * *')
  buyNewCoin30() {
    this.buyNewCoin();
  }

  buyNewCoin() {
    const newCoins = this.data.filter(({ isExist }) => !isExist);
    if (!newCoins.length) return;

    this.eventEmitter.emit('binance.newcoin', newCoins);
  }

  @OnEvent('binance.newCoin.ordered')
  onNewCoinOrdered(newCoin: NewCoin) {
    console.log('onNewCoinOrdered', newCoin);
    const index = this.data.findIndex(({ symbol }) => (symbol == newCoin.symbol));
    if (index == -1) return;

    this.data[index].isExist = true;
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

  hasNewCoin() {
    const newCoins = this.data.filter(({ isExist }) => !isExist);
    return !!newCoins.length;
  }
}

import { Controller, Get, Param } from '@nestjs/common';
import { AppEnvironment } from 'src/app.environment';

import { BinanceService } from 'src/services/binance/binance.service';

@Controller('api')
export class ApiController {
  constructor(
    private appEnvironment: AppEnvironment,
    private readonly binanceService: BinanceService,
  ) { }

  @Get('symbols')
  getSymbols() {
    return Object.keys(this.binanceService.prices)
      .filter(symbol => symbol.endsWith('USDT'));
  }

  // @Get('price/:symbol')
  // getPrice(
  //   @Param('symbol') symbol: string
  // ) {
  //   if (this.appEnvironment.isDevelopment()) {
  //     const price = this.binanceService.prices[symbol];
  //     return this.binanceService.filterPrice(symbol, price);
  //   } else {
  //     const { watchSymbol } = this.binanceService;
  //     if (watchSymbol != symbol) {
  //       this.binanceService.setWatchSymbol(symbol);
  //     }
  //     return this.binanceService.watchPrice;
  //   }
  // }

  // @MessagePattern({ cmd: "getPrice" })
  // ping({ symbol }: { symbol: string }) {
  //   return symbol;
  // }
}

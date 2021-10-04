import { Controller, Get, Param, Post } from '@nestjs/common';
import { Ctx, MessagePattern, NatsContext, Payload } from '@nestjs/microservices';
import { of } from 'rxjs';
import { delay } from "rxjs/operators";

import { AppService } from 'src/app.service';
import { BinanceService } from 'src/services/binance/binance.service';

@Controller('api')
export class ApiController {
  constructor(
    private readonly appService: AppService,
    private readonly binanceService: BinanceService,
  ) { }

  @Get('symbols')
  getSymbols() {
    return Object.keys(this.binanceService.prices)
      .filter(symbol => symbol.endsWith('USDT'));
  }

  @Get('price/:symbol')
  getPrice(
    @Param('symbol') symbol: string
  ) {
    const price = this.binanceService.prices[symbol];
    return this.binanceService.filterPrice(symbol, price);
  }

  // @MessagePattern({ cmd: "getPrice" })
  // ping({ symbol }: { symbol: string }) {
  //   return symbol;
  // }
}

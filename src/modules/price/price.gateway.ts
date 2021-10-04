import { Module } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { BinanceService } from 'src/services/binance/binance.service';

@WebSocketGateway({ cors: true })
export class PriceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server;
  users = 0;
  clients = [];

  constructor(
    private readonly binanceService: BinanceService
  ) {}

  async handleConnection() {
    this.clients = [];
  }

  async handleDisconnect() {
    this.clients = [];
  }

  @SubscribeMessage('symbol')
  async onSetPrice(
    @ConnectedSocket() client,
    @MessageBody() { symbol }: { symbol: string }) {
    this.binanceService.setWatchSymbol(symbol);
    this.clients.push(client);
  }

  @Cron(CronExpression.EVERY_SECOND)
  sendPrice() {
    this.clients.forEach(client => {
      try {
        const {
          watchSymbol,
          watchPrice
        } = this.binanceService;
        client.emit('price', { symbol: watchSymbol, price: watchPrice });
      } catch (e) {
        console.log(e);
      }
    })
  }
}

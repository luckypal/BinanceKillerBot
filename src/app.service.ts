import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { map } from "rxjs/operators";

@Injectable()
export class AppService {
  // constructor(
  //   @Inject("SERVICE_A") private readonly clientServiceA: ClientProxy
  // ) { }

  getHello(): string {
    return 'Hello World!';
  }

  // getPrice(symbol: string) {
  //   const startTs = Date.now();
  //   const pattern = { cmd: "getPrice" };
  //   const payload = { symbol };
  //   return this.clientServiceA
  //     .send<string>(pattern, payload)
  //     .pipe(
  //       map((data: string) => ({ data, duration: Date.now() - startTs }))
  //     );
  // }
}

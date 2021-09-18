import { Env } from '@nestjs-steroids/environment';
import { Transform } from 'class-transformer';
import { IsEnum, IsNumber, Max, Min } from 'class-validator';

enum NodeEnvironment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export class AppEnvironment {
  /**
   * Env decorator mark environment variable that we want to assign
   * (Tip) Without name env Env decorator makes auto UPPER_SNAKE_CASE conversion (e.g. isTest -> IS_TEST)
   */
  @Env('PORT')
  /**
   * Transform is useful for all sorts of transformations or parsing complex values
   * For example: @Transform(value => value.toLowerCase() === 'true')
   */
  @Transform(({ value }) => Number.parseInt(value, 10))
  /**
   * Also, you could use class-validator operators for validation of the correctness of environment variables
   */
  @IsNumber()
  @Min(0)
  @Max(65535)
  readonly port = 3333;

  @Env('NODE_ENV')
  @IsEnum(NodeEnvironment)
  readonly nodeEnvironment = NodeEnvironment.Development;

  isDevelopment() {
    return this.nodeEnvironment === NodeEnvironment.Development;
  }

  envString() {
    return this.isDevelopment() ? 'staging' : 'prod';
  }

  @Env('TELEGRAM_API_ID')
  readonly tgAppId = '';

  @Env('TELEGRAM_API_HASH')
  readonly tgApiHash = '';

  @Env('TELEGRAM_DCID')
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsNumber()
  readonly tgDcId = 1;

  @Env('TELEGRAM_CHANNEL_ID')
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsNumber()
  readonly tgChannelId = 0;

  @Env('PHONE_NUMBER')
  readonly phoneNumber = '';

  @Env('BINANCE_API_KEY')
  readonly bncApiKey = '';

  @Env('BINANCE_SECRET_KEY')
  readonly bncSecKey = '';

  @Env('BINANCE_UPDATE_INTERVAL')
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsNumber()
  readonly bncUpdateInterval = 10;

  readonly logFileDir = './data'
}

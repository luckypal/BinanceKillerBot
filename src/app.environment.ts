import { Env } from '@nestjs-steroids/environment';
import { Transform } from 'class-transformer';
import { IsArray, IsEnum, IsNumber, IsString, Max, Min } from 'class-validator';

export enum NodeEnvironment {
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

  @Env('SERVER_NAME')
  readonly serverName = 'Default';

  @Env('TELEGRAM_API_ID')
  readonly tgAppId = '';

  @Env('TELEGRAM_API_HASH')
  readonly tgApiHash = '';

  @Env('TELEGRAM_DCID')
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsNumber()
  readonly tgDcId = 1;

  @Env('TELEGRAM_CORNIX_ID')
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsNumber()
  readonly tgCornixId = 0;

  @Env('TELEGRAM_VIP_ID')
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsNumber()
  readonly tgVipId = 0;

  @Env('PHONE_NUMBER')
  readonly phoneNumber = '';

  @Env('BINANCE_API_KEY')
  readonly bncApiKey = '';

  @Env('BINANCE_SEC_KEY')
  readonly bncSecKey = '';

  @Env('BINANCE_UPDATE_INTERVAL')
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsNumber()
  readonly bncUpdateInterval = 10;

  @Env('DATA_DIR')
  @Transform(({ value }) => value ? `./${value}` : './data')
  @IsString()
  readonly logFileDir = './data'

  @Env('USE_OFFSET')
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsNumber()
  readonly useOffset = 0;

  @Env('TIMEZONE_OFFSET')
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsNumber()
  readonly timezoneOffset = -5;

  readonly dateTimeFormat = 'YYYY-MM-DD HH:mm:ss';

  /**
   * Exceptional coins for Bot
   */
  @Env('COIN_EXCEPTION')
  @Transform(({ value }) => value ? value.split(',') : [])
  @IsArray()
  readonly coinExceptions = [];

  @Env('RATIO_TRADE_NEWCOIN')
  @Transform(({ value }) => value ? Number.parseFloat(value) : 0.9)
  @IsNumber()
  readonly ratioTradeNewCoin = 0.9;

  @Env('RATIO_TRADE_ONCE')
  @Transform(({ value }) => value ? Number.parseFloat(value) : 0.5)
  @IsNumber()
  readonly ratioTradeOnce = 0.5;

  @Env('FRONTEND_SECRET_KEY')
  @IsString()
  readonly frontendSecKey = '';

  readonly buyOrderLiveTime = 24; // Hours.
}

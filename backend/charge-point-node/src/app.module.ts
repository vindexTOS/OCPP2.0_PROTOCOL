import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { SessionModule } from 'nestjs-session';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { OcppModule } from './ocpp/ocpp.module';

@Module({
  imports: 
  [
  OcppModule,
  ConfigModule.forRoot(),
  MongooseModule.forRoot(
    'mongodb://root@37.27.179.61:27017/root',
    {
      dbName: "root",
    }),
  SessionModule.forRoot({
      session: { secret: 'keyboard cat' },
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
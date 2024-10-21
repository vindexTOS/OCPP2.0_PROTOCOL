import { MiddlewareConsumer, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { OcppModule } from './ocpp/ocpp.manage.module';
import { AuthModule } from './auth/auth.module';

const cookieSession = require('cookie-session');


@Module({
  imports: 
  [
    OcppModule,
    AuthModule,
    ConfigModule.forRoot(),
    MongooseModule.forRoot(
      'mongodb://37.27.179.61/root', 
      {
        dbName: "root",
      }),    
      // MongooseModule.forRoot(
      //   'mongodb://root:password@mongodb:27017/?authSource=admin'
      //   , 
      //   {
      //     dbName: "root",
      //   }),  
      RabbitMQModule.forRoot(RabbitMQModule, {
        exchanges: [
          {
            name: 'management.system',
            type: 'direct',
          },
        ],
        uri: 'amqp://guest:guest@localhost:5672',
        connectionInitOptions: { 
          wait: false, // Set to true if you want to wait until the connection is established
          timeout: 10000 // Increase timeout to 10 seconds or more
        },
      }),
],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(
        cookieSession({
          keys: ['asdfasfd'],
        }),
      )
      .forRoutes('*');    
  }
}

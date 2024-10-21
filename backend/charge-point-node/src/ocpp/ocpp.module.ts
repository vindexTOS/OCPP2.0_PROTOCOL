import { Module } from '@nestjs/common';
import { ModelDefinition, MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { AutoIncrementID, AutoIncrementIDOptions } from '@typegoose/auto-increment';
import mongoose from 'mongoose';

import { OcppServer as OcppServer2 } from '@extrawest/node-ts-ocpp';
import { OcppServer as OcppServer1 } from 'ocpp-ts';

import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';

import { ChargePoint, ChargePointSchema } from './schemas/charge.point.schemas';
import { OcppService as Ocpp2Service } from './ocpp.new.service';
import { OcppService as Ocpp1Service } from './ocpp.service';
import { OcppController } from './ocpp.controller';
import { Transaction, TransactionSchema } from './schemas/transactions.schema';

@Module({
  imports: [
    RabbitMQModule.forRoot(RabbitMQModule, {
      exchanges: [
        {
          name: 'management.system',
          type: 'direct',
        },
<<<<<<< HEAD
      ],
      uri: 'amqp://guest:guest@localhost:5672',
    }),
=======
      ], 

      uri: 'amqp://guest:guest@172.20.0.2:5672',    }),
>>>>>>> 22c9827cce395445c665993f9ab35b3f2a35f14b
    MongooseModule.forFeatureAsync([
      {
        name: ChargePoint.name,
        inject: [getConnectionToken()],
        useFactory: (connection: mongoose.Connection): ModelDefinition['schema'] => {
          const schema = ChargePointSchema
          schema.plugin(AutoIncrementID, { field: 'cpId' } as AutoIncrementIDOptions)
          return schema
        }
      },
      {
        name: Transaction.name,
        inject: [getConnectionToken()],
        useFactory: (connection: mongoose.Connection): ModelDefinition['schema'] => {
          const schema = TransactionSchema
          schema.plugin(AutoIncrementID, { field: 'transactionId' } as AutoIncrementIDOptions)
          return schema
      },}
    ]),
  ],
  providers: [Ocpp1Service, Ocpp2Service, OcppServer2, OcppServer1],
  controllers: [OcppController]
})
export class OcppModule {}

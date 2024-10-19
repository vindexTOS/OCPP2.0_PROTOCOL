import { Logger, Injectable, OnApplicationBootstrap, HttpException, HttpStatus } from '@nestjs/common';
import { BootNotificationRequest, BootNotificationResponse, HeartbeatRequest, HeartbeatResponse, OcppClientConnection, OcppServer, UnlockConnectorRequest, UnlockConnectorResponse, AuthorizeResponse, AuthorizeRequest, StartTransactionRequest, StartTransactionResponse, StopTransactionRequest, StopTransactionResponse, MeterValuesRequest, MeterValuesResponse, StatusNotificationRequest, StatusNotificationResponse, FirmwareStatusNotificationRequest, FirmwareStatusNotificationResponse } from 'ocpp-ts';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';

import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MongoError } from 'mongodb';

import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";

import { ChargePoint } from './schemas/charge.point.schemas';
import { Transaction } from './schemas/transactions.schema';

import { CreateTransaction, StopReason } from './dtos/create.transaction.dto';
import { CreateCPDto,Status,Connector } from './dtos/create.cp.dto';
import { start } from 'repl';

const scrypt = promisify(_scrypt);

interface ConnectorStatus {
    status: Status;
    meterValues?: MeterValuesRequest;
  }
  
  interface Transactions {
    authorization: AuthorizeResponse;
    start: StartTransactionResponse;
    end: StopTransactionResponse;
  }
  
  interface ChargePointInfo {
    chargePoint: ChargePoint;
    connectorStatus: { [connectorId: number]: ConnectorStatus };
    transactions: Transactions;
  }
  
  interface ChargePointData {
    chargePoints: { [cpId: string]: ChargePointInfo };
  }

@Injectable()
export class OcppService implements OnApplicationBootstrap {
    private data: ChargePointData = {
        chargePoints: {},
    };
    private transaction: CreateTransaction = new this.transactionModel({
        connectorId: 0,
        idTag: '',
        meterStart: 0,
        startTimestamp: new Date(),
        transactionId: 0,
        meterStop: 0,
        stopTimestamp: new Date(),
        stopReason: StopReason.Other,
    });
    private server: OcppServer;
    constructor(
        private readonly MyOcppServer: OcppServer,
        private readonly amqpConnection: AmqpConnection,
        
        @InjectModel(ChargePoint.name) private readonly chargePointModel: Model<ChargePoint>,
        @InjectModel(Transaction.name) private readonly transactionModel: Model<Transaction>,
    ) { 

 
    }

    private readonly logger = new Logger(OcppService.name);
    async onApplicationBootstrap() {
        this.server = new OcppServer();
        this.server.listen(9210);
        this.logger.log('OCPP server listening on port 9210');

        this.server.on('connection', (client: OcppClientConnection) => {
            this.logger.log(`New client connected: ${client.getCpId()}`);

            // Handle specific events
            client.on('Authorize', (request, cb) => {
                this.logger.log(`Authorize request received: ${JSON.stringify(request)}`);
                // Process the request and call the callback with the response
                cb({ idTagInfo: { status: 'Accepted' } }); // Example response
            });

            client.on('BootNotification', (request, cb) => {
                this.logger.log(`BootNotification request received: ${JSON.stringify(request)}`);
                // Example response
                // cb({ currentStatus: 'Accepted', status: 'Accepted' });
            });

            // client.on('Heartbeat', (request, cb) => {
            //     this.logger.log(`Heartbeat request received: ${JSON.stringify(request)}`);
            //     // Respond to the heartbeat
            //     cb({});
            // });

            // Handle error
            client.on('error', (err) => {
                this.logger.error(`Client error: ${err.message}`);
            });

            // Handle client disconnection
            client.on('close', (code, reason) => {
                this.logger.log(`Client disconnected: ${code}, reason: ${reason.toString()}`);
            });
        });
    }
    async updateLastSeen(cpId: string): Promise<void> {
        const chargePoint = this.data.chargePoints[cpId].chargePoint;
        if (!chargePoint) {
            this.logger.error(`Charge point with ID ${cpId} not found`);
            return;
        }
    
        chargePoint.lastActivity = new Date()
        const result = await this.chargePointModel.updateOne({ _id: chargePoint._id }, { lastActivity: chargePoint.lastActivity });
    }

    async updateTransactionStatus(chargePointId: string, transactionId: number,connectorId: number, status: "Accepted" | "Blocked" | "Expired" | "Invalid" | "ConcurrentTx"): Promise<void> {
        const chargePointData = this.data.chargePoints[chargePointId];
        if (!chargePointData) {
            this.logger.error(`Charge point with ID ${chargePointId} not found`);
            return;
        }
        chargePointData.transactions.start.idTagInfo.status = status;
        this.logger.log(`Transaction ${transactionId} status updated to ${status}`);
        if (status === 'Accepted') {
            chargePointData.transactions.end.idTagInfo.status = 'Invalid';

            const message = {
                id: chargePointId,
                charger: this.data.chargePoints[chargePointId].chargePoint,
                connectorId: connectorId,
                serial_number: chargePointData.chargePoint.serial_number,
                startTimestamp: new Date(),
                lastActivity: 60,
            };
            this.logger.log(`Transaction ${transactionId} started on ${chargePointId} in connector ${connectorId}`);
            this.chargePointModel.findOne({ _id: chargePointData.chargePoint._id }).then(chargePoint => {
                chargePoint.status = Status.Charging;
                chargePoint.connectors[connectorId].status = Status.Charging;
                chargePoint.connectors[connectorId].meterValue = this.transaction.meterStart;
                chargePoint.connectors[connectorId].startTimestamp = this.transaction.startTimestamp;
                chargePoint.markModified('connectors');
                this.logger.log(`status::: ${chargePoint.status}`);
                chargePoint.save();
            }).catch(err => {
                this.logger.error(`Error updating transaction status: ${err}`);
            });
            await this.amqpConnection.publish('management.system', 'transaction.routing.key', message);

        }
        else if (status === 'Invalid') {
            this.logger.log(`Transaction ${transactionId} ended for connector ${connectorId}`);
            this.chargePointModel.findOne({ _id: chargePointData.chargePoint._id }).then(chargePoint => {
                chargePoint.status = Status.Available;
                chargePoint.connectors[connectorId].status = Status.Available;
                chargePoint.connectors[connectorId].meterValue = 0;
                chargePoint.markModified('connectors');
                chargePoint.save();
            }).catch(err => {
                this.logger.error(`Error updating transaction status: ${err}`);
            });
            await this.transactionModel.create(this.transaction);
            this.transaction = this.newEmptyTransaction();
        }
    }

    async findBySerialNumber(serial_number: any): Promise<ChargePoint> {
        this.logger.log(`Finding charge point by serial number: ${serial_number}`);
        return await this.chargePointModel.findOne({ serial_number: serial_number }).exec();
    }

    async registerChargePoint(body: CreateCPDto): Promise<ChargePoint> {
    
        const salt = randomBytes(8).toString('hex');
        const hash = (await scrypt(body.password, salt, 32)) as Buffer;
        const result = salt + '.' + hash.toString('hex');
        body.password = result;
        body.status = Status.Unavailable;
        this.logger.log('Body: ' + JSON.stringify(body));
    
        try {
            const connectors: Connector[] = body.connectors.map((connector) => ({
                type: connector.type,
                status: connector.status
            }));
            body.connectors = connectors;
            const createdChargePoint = new this.chargePointModel(body);
            return await createdChargePoint.save();
        } catch (error) {
            this.logger.error(`Error registering charge point: ${error}`);
            if (error instanceof MongoError && error.code === 11000) {
                throw new HttpException('Charge point with this serial number already exists', HttpStatus.CONFLICT);
            }
            throw error;
        }
    }
    

    async getAllChargePoints() {
        return this.chargePointModel.find().exec();
    }

    async getConnectorStatus(connectorId: string) {
        return this.chargePointModel.find({ connectors: { $elemMatch: { connectorId: connectorId } } }).exec();
    }

    newEmptyTransaction(): CreateTransaction {
        return new this.transactionModel({
            connectorId: 0,
            idTag: '',
            meterStart: 0,
            startTimestamp: new Date(),
            transactionId: 0,
            meterStop: 0,
            stopTimestamp: new Date(),
            stopReason: StopReason.Other,
        });
    }
}

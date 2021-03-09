import { DBService } from '../database';
import { IOperationInitParams, Operation } from './Operation';
import { createError } from '../../routes/helpers';
import { ACTION_TYPE, OPERATION_TYPE, STATUS } from './interfaces';
import { hmy } from '../../blockchain/hmy';
import { normalizeEthKey } from '../../blockchain/utils';
import { validateEthBalanceNonZero, validateOneBalanceNonZero } from './validations';
import moment from 'moment';

export interface IOperationService {
  database: DBService;
}

export class OperationService {
  database: DBService;

  dbCollectionName = 'operations';

  operations: Operation[] = [];

  constructor(params: IOperationService) {
    this.database = params.database;

    this.restoreOperationsFromDB();
  }

  restoreOperationsFromDB = async () => {
    const operations = await this.database.getCollectionData(this.dbCollectionName);

    operations.forEach(operationDB => {
      const operation = new Operation(operationDB, this.saveOperationToDB);

      this.operations.push(operation);
    });
  };

  saveOperationToDB = async (operation: Operation) => {
    await this.database.updateDocument(
      this.dbCollectionName,
      operation.id,
      operation.toObject({ payload: true })
    );
  };

  validateOperationBeforeCreate = async (params: IOperationInitParams) => {
    const normalizeOne = v => hmy.crypto.getAddress(v).checksum;

    if (this.operations.some(o => o.id === params.id)) {
      throw createError(500, 'This operation already in progress');
    }

    if (params.type === OPERATION_TYPE.ONE_ETH) {
      const DAY = 1000 * 60 * 60 * 24;

      const userTxs = this.operations.filter(
        o =>
          Date.now() - DAY < o.timestamp &&
          o.type === OPERATION_TYPE.ONE_ETH &&
          o.oneAddress === params.oneAddress &&
          [STATUS.SUCCESS, STATUS.IN_PROGRESS, STATUS.WAITING].includes(o.status)
      );

      if (userTxs.length >= 5) {
        throw createError(
          500,
          'You have reached the limit of transfers from Harmony to Ethereum (5 transfers within 24 hours)'
        );
      }
    }

    if (
      this.operations.some(
        op =>
          normalizeEthKey(op.ethAddress) === normalizeEthKey(params.ethAddress) &&
          normalizeOne(op.oneAddress) === normalizeOne(params.oneAddress) &&
          op.type === params.type &&
          op.token === params.token &&
          (op.status === STATUS.IN_PROGRESS || op.status === STATUS.WAITING) &&
          Date.now() - op.timestamp * 1000 < 1000 * 120 // 120 sec
      )
    ) {
      throw createError(500, 'This operation already in progress');
    }

    try {
      switch (params.type) {
        case OPERATION_TYPE.ONE_ETH:
          await validateOneBalanceNonZero(params.oneAddress);
          break;
        case OPERATION_TYPE.ETH_ONE:
          await validateEthBalanceNonZero(params.ethAddress);
          break;
        default:
          throw createError(400, 'Invalid operation type');
      }
    } catch (e) {
      throw createError(500, 'User eth balance is to low');
    }

    return true;
  };

  create = async (params: IOperationInitParams) => {
    await this.validateOperationBeforeCreate(params);

    const operation = new Operation(
      {
        id: params.id,
        type: params.type,
        erc20Address: params.erc20Address,
        token: params.token,
        ethAddress: params.ethAddress,
        oneAddress: params.oneAddress,
        amount: params.amount,
      },
      this.saveOperationToDB
    );

    await this.saveOperationToDB(operation);

    this.operations.push(operation);

    return operation.toObject();
  };

  getOperationById = (id: string) => {
    const operation = this.operations.find(operation => operation.id === id);

    if (operation) {
      return operation.toObject();
    }

    return null;
  };

  setActionHash = (params: {
    operationId: string;
    actionType: ACTION_TYPE;
    transactionHash: string;
  }) => {
    const operation = this.operations.find(o => o.id === params.operationId);

    if (!operation) {
      throw createError(400, 'Operation not found');
    }

    const action = operation.actions.find(a => a.type === params.actionType);

    if (!action) {
      throw createError(400, 'Action not found');
    }

    action.setTransactionHash(params.transactionHash);

    return operation.toObject();
  };

  getAllOperations = (params: {
    ethAddress?: string;
    oneAddress?: string;
    size: number;
    page: number;
  }) => {
    const filteredData = this.operations
      .filter(o => !!o.timestamp)
      .filter(o => o.status !== STATUS.CANCELED)
      .filter(operation => {
        const hasEthAddress = params.ethAddress ? params.ethAddress === operation.ethAddress : true;
        const hasOneAddress = params.oneAddress ? params.oneAddress === operation.oneAddress : true;

        return hasEthAddress && hasOneAddress;
      });

    const sortedData = filteredData.sort((a, b) => {
      return moment(a.timestamp).isBefore(b.timestamp) ? 1 : -1;
    });

    const from = params.page * params.size;
    const to = (params.page + 1) * params.size;
    const paginationData = sortedData.slice(from, Math.min(to, filteredData.length));

    const content = paginationData.map(operation => operation.toObject({ payload: true }));

    return {
      content,
      totalElements: filteredData.length,
      totalPages: Math.ceil(filteredData.length / params.size),
      size: params.size,
      page: params.page,
    };
  };
}

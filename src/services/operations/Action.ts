import { clearPayload, uuidv4 } from '../utils';
import { ACTION_TYPE, STATUS } from './interfaces';
import { createError } from '../../routes/helpers';
import { sleep } from '../../blockchain/utils';
import { TransactionReceipt } from 'web3-core';
import logger from '../../logger';
const log = logger.module('validator:action');

const AWAIT_STEP_LONG = 20 * 1000; // 20 sec
const AWAIT_STEP_SHORT = 3 * 1000; // 3 sec

const WAIT_TIMEOUT = 20 * 60 * 1000; // 20 min

const isEth = (type: ACTION_TYPE) =>
  [
    ACTION_TYPE.approveEthManger,
    ACTION_TYPE.unlockToken,
    ACTION_TYPE.lockToken,
    ACTION_TYPE.waitingBlockNumber,
    ACTION_TYPE.unlockTokenRollback,
  ].includes(type);

export type TActionCallFunction = (
  props?: any
) => Promise<{
  status: boolean;
  transactionHash?: string;
}>;

export interface IActionInitParams {
  type: ACTION_TYPE;
  callFunction: TActionCallFunction;
  awaitConfirmation?: boolean;
  startRollbackOnFail?: boolean;
}

export class Action {
  id: string;
  type: ACTION_TYPE;
  status: STATUS;
  transactionHash: string;
  error: string;
  message: string;
  timestamp: number;
  payload: TransactionReceipt | any;
  awaitConfirmation: boolean;
  startRollbackOnFail: boolean;

  callFunction: TActionCallFunction;

  constructor(params: IActionInitParams, initParam?: Action) {
    this.id = uuidv4();
    this.status = STATUS.WAITING;
    this.type = params.type;
    this.callFunction = params.callFunction;
    this.awaitConfirmation = !!params.awaitConfirmation;
    this.startRollbackOnFail = !!params.startRollbackOnFail;
  }

  public setParams = (action: Action) => {
    this.id = action.id;
    this.type = action.type;
    this.status = action.status;
    this.transactionHash = action.transactionHash;
    this.message = action.message;
    this.error = action.error;
    this.timestamp = action.timestamp;
    this.payload = action.payload;
  };

  public call = async () => {
    if (this.awaitConfirmation) {
      let maxAwaitTime = WAIT_TIMEOUT;

      while (!this.transactionHash && maxAwaitTime >= 0) {
        await sleep(1000);
        maxAwaitTime = maxAwaitTime - 1000;
      }

      if (!this.transactionHash) {
        this.status = STATUS.CANCELED;
        this.error = 'Rejected by timeout, while waiting for user to sign';
        return false;
      }
    }

    this.status = STATUS.IN_PROGRESS;
    this.timestamp = Math.round(+new Date() / 1000);

    try {
      let res;
      const AWAIT_STEP = isEth(this.type) ? AWAIT_STEP_LONG : AWAIT_STEP_SHORT;

      if (this.awaitConfirmation && !isEth(this.type)) {
        let maxAwaitTime = WAIT_TIMEOUT;

        while (!res && maxAwaitTime >= 0) {
          res = await this.callFunction(this.transactionHash);
          await sleep(AWAIT_STEP);
          maxAwaitTime = maxAwaitTime - AWAIT_STEP;
        }
      } else {
        res = await this.callFunction(this.transactionHash);
      }

      this.transactionHash = res.transactionHash;
      this.payload = res;

      if (res.status === true) {
        this.status = STATUS.SUCCESS;

        return true;
      } else {
        this.error = 'Tx status not success';

        log.error(`${this.type.toString()}: tx status not success`, {
          error: '',
          action: this.toObject({ payload: true }),
        });
      }
    } catch (e) {
      log.error(`${this.type.toString()}: action exception error`, {
        error: e,
        action: this.toObject({ payload: true }),
      });

      this.error = e.message;
    }

    this.status = STATUS.ERROR;

    return false;
  };

  public setTransactionHash = (transactionHash: string) => {
    if (this.awaitConfirmation && !this.transactionHash) {
      this.transactionHash = transactionHash;
    } else {
      throw createError(500, 'Transaction hash already saved');
    }
  };

  public toObject = (params?: { payload?: boolean }) => {
    const obj = {
      id: this.id,
      type: this.type,
      status: this.status,
      transactionHash: this.transactionHash,
      error: this.error,
      message: this.message,
      timestamp: this.timestamp,
      payload: null,
    };

    // generate payload object - root level
    if (params && params.payload && this.payload) {
      obj.payload = clearPayload(this.payload);
      // obj.payload = this.payload;
    }

    for (const key in obj) {
      if (obj[key] === undefined) {
        delete obj[key];
      }
    }

    return obj;
  };
}

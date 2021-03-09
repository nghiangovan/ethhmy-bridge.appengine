import { TransactionReceipt } from 'web3-core';
import { Harmony } from '@harmony-js/core';
import { Contract } from '@harmony-js/contract';
import { HmyManager } from './HmyManager';
import { EventsConstructor } from '../helpers/EventsConstructor';
import { HmyEventsTracker } from './HmyEventsTracker';
import logger from '../../logger';
import { AVG_BLOCK_TIME, BLOCK_TO_FINALITY, sleep } from '../utils';
import { ActionsQueue } from '../helpers/ActionsQueue';
const log = logger.module('validator:hmyMethodsBase');

import erc20Json = require('../contracts/MyERC20.json');
import hmyManagerJsonLINK = require('../contracts/LINKHmyManager.json');
import hmyMultiSigWalletJson = require('../contracts/MultiSigWallet.json');
import { createHmySdk } from './index';

const queue = new ActionsQueue();

interface IHmyMethodsInitParams {
  hmyManagerAddress: string;
  hmyManagerMultiSigAddress: string;
  options?: { gasPrice: number; gasLimit: number };
  hmyEventsTracker: HmyEventsTracker;
  hmyTokenContractAddress: string;
  hmyManagerJson?: any;
}

export class HmyMethodsBase extends EventsConstructor {
  hmySdk: Harmony;
  hmyTokenContract: Contract;
  hmyTokenContractAddress: string;
  hmyManagerAddress: string;
  hmyManagerMultiSigAddress: string;
  hmyManagerJson: any;
  hmyManager: HmyManager;
  hmyManagerMultiSig: HmyManager;
  hmyEventsTracker: HmyEventsTracker;
  options = { gasPrice: 1000000000, gasLimit: 6721900 };

  constructor({
    hmyTokenContractAddress,
    hmyManagerAddress,
    options,
    hmyManagerMultiSigAddress,
    hmyEventsTracker,
    hmyManagerJson,
  }: IHmyMethodsInitParams) {
    super();

    this.hmyTokenContractAddress = hmyTokenContractAddress;
    this.hmyManagerAddress = hmyManagerAddress;
    this.hmyManagerMultiSigAddress = hmyManagerMultiSigAddress;
    this.hmyManagerJson = hmyManagerJson || hmyManagerJsonLINK;

    this.initHmySdk();
    this.initHmyManager();
    this.initHmyManagerMultiSig();
    this.initHmyTokenContract();

    if (options) {
      this.options = options;
    }

    this.hmyEventsTracker = hmyEventsTracker;

    // subscribe current manager to Submission events
    this.hmyEventsTracker.addTrack('Minted', this.hmyManager, this.eventHandler);
    this.hmyEventsTracker.onEventHandler(this.eventHandler);
  }

  initHmySdk = () => {
    this.hmySdk = createHmySdk();
  };

  initHmyManager = () => {
    this.hmyManager = new HmyManager(this.hmyManagerJson, this.hmyManagerAddress);
  };

  initHmyManagerMultiSig = () => {
    this.hmyManagerMultiSig = new HmyManager(hmyMultiSigWalletJson, this.hmyManagerMultiSigAddress);
  };

  initHmyTokenContract = () => {
    this.hmyTokenContract = this.hmySdk.contracts.createContract(
      erc20Json.abi,
      this.hmyTokenContractAddress
    );
  };

  isWSConnected = () => {
    return true;
  };

  decodeApprovalLog = (receipt: TransactionReceipt) => {
    return this.hmyTokenContract.abiCoder.decodeLog(
      this.hmyTokenContract.abiModel.getEvent('Approval').inputs,
      receipt.logs[0].data,
      receipt.logs[0].topics.slice(1)
    );
  };

  decodeBurnTokenLog = (receipt: TransactionReceipt) => {
    const receiptLogs = receipt.logs[3] || receipt.logs.slice(-1)[0];

    return this.hmyManager.contract.abiCoder.decodeLog(
      this.hmyManager.contract.abiModel.getEvent('Burned').inputs,
      receiptLogs.data,
      receiptLogs.topics.slice(1)
    );
  };

  waitingBlockNumber = async (blockNumber, txnHash, callbackMessage) => {
    {
      const res = await this.hmySdk.blockchain.getTransactionByHash({ txnHash });

      if (!res.result.blockNumber) {
        return {
          status: false,
          error: 'txHash no longer exists in the longest chain, possibly forked',
        };
      }

      const expectedBlockNumber = blockNumber + BLOCK_TO_FINALITY;

      while (true) {
        const res = await this.hmySdk.blockchain.getBlockNumber();
        const blockNumber = Number(res.result);

        if (blockNumber <= expectedBlockNumber) {
          callbackMessage(
            `Currently at block ${blockNumber}, waiting for block ${expectedBlockNumber} to be confirmed`
          );

          await sleep(AVG_BLOCK_TIME);
        } else {
          break;
        }
      }
      return { status: true };
    }
  };

  getTransactionReceipt = async txnHash => {
    const res = await this.hmySdk.blockchain.getTransactionReceipt({ txnHash });

    if (!res.result) {
      return res.result;
    }

    const txInfoRes = await this.hmySdk.blockchain.getTransactionByHash({ txnHash });

    return { ...res.result, ...txInfoRes.result, status: res.result.status === '0x1' };
  };

  submitTx = async data => {
    let res = { status: 'rejected', transactionHash: '', error: '', transaction: null, events: {} };
    try {
      res = await this.hmyManagerMultiSig.contract.methods
        .submitTransaction(this.hmyManager.address, 0, data)
        .send(this.options)
        .on('hash', hash => {
          res.transactionHash = hash;
        });
    } catch (e) {
      log.error('submitTxHmy error: ', { error: e, res, data, address: this.hmyManager.address });

      res.error = e.message;
    }

    console.log('submitTxHmy status: ', res.status);

    return {
      ...res.transaction,
      status: res.status === 'called',
      transactionHash: res.transaction && res.transaction.id,
    };
  };

  confirmTx = async transactionId => {
    let res = { status: 'rejected', transactionHash: '', error: '', transaction: null };

    try {
      res = await this.hmyManagerMultiSig.contract.methods
        .confirmTransaction(transactionId)
        .send(this.options)
        .on('hash', hash => {
          res.transactionHash = hash;
        });
    } catch (e) {
      console.log('confirmTx error: ', e);

      res.error = e.message;
    }

    // console.log('confirmTx status: ', res.status);

    return {
      ...res.transaction,
      status: res.status === 'called',
      transactionHash: res.transaction && res.transaction.id,
    };
  };

  submitTxHmy = async data => {
    const firstOwner = await this.hmyManagerMultiSig.contract.methods.owners(0).call(this.options);
    const validatorAddress = this.hmyManager.contract.wallet.accounts[0];
    console.log('firstOwner: ', firstOwner);
    console.log('validatorAddress: ', validatorAddress);

    if (firstOwner.toLowerCase() === validatorAddress.toLowerCase()) {
      // i am the first owner
      return new Promise((resolve, reject) =>
        queue.addAction({
          func: async () => await this.submitTx(data),
          resolve,
          reject,
        })
      );
    } else {
      return new Promise((resolve, reject) => {
        this.subscribe({
          event: 'Submission',
          success: async event => {
            console.log('Submission', event.returnValues.transactionId);

            const res = await this.confirmTx(event.returnValues.transactionId);

            resolve(res);
          },
          failed: err => reject(err.error),
          condition: event => event.transaction.data === data,
        });
      });
    }
  };

  getBalance = async (addr: string) => {
    const addrHex = this.hmySdk.crypto.getAddress(addr).checksum;

    let balance = 0;

    try {
      balance = await this.hmyTokenContract.methods.balanceOf(addrHex).call(this.options);
    } catch (e) {
      log.error('hmyTokenContract.methods.balanceOf', { error: e });

      await sleep(5000);

      this.hmySdk = createHmySdk();

      this.hmyTokenContract = this.hmySdk.contracts.createContract(
        erc20Json.abi,
        this.hmyTokenContractAddress
      );

      try {
        balance = await this.hmyTokenContract.methods.balanceOf(addrHex).call(this.options);
      } catch (e) {
        log.error('hmyTokenContract.methods.balanceOf 2', { error: e });
      }
    }

    return balance;
  };
}

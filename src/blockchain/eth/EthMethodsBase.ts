import BN from 'bn.js';
import { AVG_BLOCK_TIME, BLOCK_TO_FINALITY, sleep, withDecimals } from '../utils';
import { TransactionReceipt } from 'web3-core';
import { EthManager } from './EthManager';
import Web3 from 'web3';
import { EventsConstructor } from '../helpers/EventsConstructor';
import { EthEventsTracker } from './EthEventsTracker';
import logger from '../../logger';
import { ActionsQueue } from '../helpers/ActionsQueue';
const log = logger.module('validator:ethMethodsBase');

const queue = new ActionsQueue();

const WAIT_TIMEOUT = 60 * 60 * 1000;
const AWAIT_STEP = 5 * 1000;

export interface IEthMethodsInitParams {
  web3: Web3;
  ethManager: EthManager;
  ethToken: EthManager;
  ethMultiSigManager: EthManager;
  ethEventsTracker: EthEventsTracker;
}

export class EthMethodsBase extends EventsConstructor {
  web3: Web3;
  ethManager: EthManager;
  ethMultiSigManager: EthManager;
  ethToken: EthManager;
  ethEventsTracker: EthEventsTracker;

  constructor(params: IEthMethodsInitParams) {
    super();

    this.web3 = params.web3;
    this.ethManager = params.ethManager;
    this.ethMultiSigManager = params.ethMultiSigManager;
    this.ethToken = params.ethToken;
    this.ethEventsTracker = params.ethEventsTracker;

    // subscribe current manager to Submission events
    this.ethEventsTracker.addTrack(
      'Unlocked',
      this.ethManager.contract,
      this.eventHandler,
      () => !!Object.keys(this.subscribers).length
    );
    this.ethEventsTracker.onEventHandler(this.eventHandler);
  }

  isWSConnected = () => {
    return true;
  };

  // getTransactionByHash = async (transactionHash: string) => {
  //   return await web3.eth.getTransaction(transactionHash);
  // };

  getTransactionReceipt = async (transactionHash: string) => {
    const res = await this.web3.eth.getTransactionReceipt(transactionHash);

    if (!res) {
      return res;
    }

    const txInfo = await this.web3.eth.getTransaction(transactionHash);

    return { ...txInfo, ...res };
  };

  waitTransaction = async (transactionHash: string, callback?) => {
    let txInfo = await this.web3.eth.getTransaction(transactionHash);

    let maxAwaitTimeoutSmall = 5 * 60 * 1000;

    while (!txInfo && maxAwaitTimeoutSmall >= 0) {
      await sleep(3000);

      txInfo = await this.web3.eth.getTransaction(transactionHash);

      maxAwaitTimeoutSmall = maxAwaitTimeoutSmall - 3000;
    }

    if (!txInfo) {
      log.error('waitTransaction: Transaction not found', { transactionHash });

      return { status: false, transactionHash, error: 'Transaction not found' };
    }

    // console.log(txInfo)

    const { from, nonce, blockNumber } = txInfo;

    let lastBlock = blockNumber;

    if (!lastBlock) {
      lastBlock = await this.web3.eth.getBlockNumber();
    }

    let txHash = transactionHash;
    let maxAwaitTime = WAIT_TIMEOUT;
    let res;

    while (!res && maxAwaitTime >= 0) {
      await sleep(AWAIT_STEP);
      maxAwaitTime = maxAwaitTime - AWAIT_STEP;

      res = await this.web3.eth.getTransactionReceipt(txHash);

      if (!res) {
        // check to other tx with the same nonce
        const block = await this.web3.eth.getBlock(lastBlock, true);

        if (!!block) {
          lastBlock++;
        }

        if (!!block && !!block.transactions) {
          block.transactions.forEach(transaction => {
            if (from === transaction.from && nonce === transaction.nonce) {
              txHash = transaction.hash;
              if (callback) {
                callback(transaction);
              }
            }
          });
        }
      }
    }

    if (!res) {
      log.error('waitTransaction: Transaction not found 2', { txHash });

      return { status: false, transactionHash, error: 'Transaction not found' };
    }

    txInfo = await this.web3.eth.getTransaction(txHash);

    return { ...txInfo, ...res };
  };

  decodeApprovalLog = (receipt: TransactionReceipt) => {
    return this.web3.eth.abi.decodeLog(
      [
        { indexed: true, name: 'owner', type: 'address' },
        { indexed: true, name: 'spender', type: 'address' },
        { indexed: false, name: 'value', type: 'uint256' },
      ],
      receipt.logs[0].data,
      receipt.logs[0].topics.slice(1)
    );
  };

  decodeLockTokenLog = (receipt: TransactionReceipt) => {
    return this.web3.eth.abi.decodeLog(
      [
        {
          indexed: true,
          internalType: 'address',
          name: 'token',
          type: 'address',
        },
        {
          indexed: true,
          internalType: 'address',
          name: 'sender',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'amount',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'address',
          name: 'recipient',
          type: 'address',
        },
      ],
      receipt.logs[1].data,
      receipt.logs[1].topics.slice(1)
    );
  };

  waitingBlockNumber = async (blockNumber, txHash, callbackMessage) => {
    {
      let tx = await this.web3.eth.getTransaction(txHash);

      let maxAwaitTimeoutSmall = 2 * 60 * 1000;

      while ((!tx || !tx.blockNumber) && maxAwaitTimeoutSmall >= 0) {
        await sleep(3000);
        maxAwaitTimeoutSmall = maxAwaitTimeoutSmall - 3000;

        tx = await this.web3.eth.getTransaction(txHash);
      }

      if (!tx || !tx.blockNumber) {
        return {
          status: false,
          error: 'txHash no longer exists in the longest chain, possibly forked',
        };
      }

      const expectedBlockNumber = blockNumber + BLOCK_TO_FINALITY;

      while (true) {
        const blockNumber = await this.web3.eth.getBlockNumber();

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

  mintToken = async (accountAddr: string, amount: number, increaseSupply = false) => {
    if (!this.web3.utils.isAddress(accountAddr)) {
      throw new Error('Invalid account address');
    }

    let res;

    if (increaseSupply) {
      res = await this.ethToken.contract.methods.increaseSupply(withDecimals(amount, 18)).send({
        from: this.ethToken.account.address,
        gas: process.env.ETH_GAS_LIMIT,
        gasPrice: new BN(await this.web3.eth.getGasPrice()).mul(new BN(1)),
      });

      if (res.status !== true) {
        return res;
      }
    }

    res = await this.ethToken.contract.methods
      .transfer(accountAddr, withDecimals(amount, 18))
      .send({
        from: this.ethToken.account.address,
        gas: process.env.ETH_GAS_LIMIT,
        gasPrice: new BN(await this.web3.eth.getGasPrice()).mul(new BN(1)),
      });

    return res;
  };

  submitTxEth = async data => {
    const firstOwner = await this.ethMultiSigManager.contract.methods.owners(0).call();
    const validatorAddress = this.ethManager.account.address;

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

  private submitTx = async data => {
    let res = { status: false, transactionHash: '', error: '', events: {} };

    try {
      res = await this.ethMultiSigManager.contract.methods
        .submitTransaction(this.ethManager.address, 0, data)
        .send({
          from: this.ethMultiSigManager.account.address,
          gas: process.env.ETH_GAS_LIMIT,
          gasPrice: new BN(await this.web3.eth.getGasPrice()).mul(new BN(1)), //new BN(process.env.ETH_GAS_PRICE)
        })
        .on('hash', hash => (res.transactionHash = hash));
    } catch (e) {
      log.error('submitTxEth error: ', { error: e, res, data, address: this.ethManager.address });

      res.error = e.message;
    }

    console.log('submitTxEth status: ', res.status);

    if (!res.transactionHash) {
      return res;
    }

    const txInfoRes = await this.web3.eth.getTransaction(res.transactionHash);

    return { ...res, ...txInfoRes };
  };

  private confirmTx = async transactionId => {
    let res = { status: false, transactionHash: '', error: '' };

    try {
      res = await this.ethMultiSigManager.contract.methods
        .confirmTransaction(transactionId)
        .send({
          from: this.ethMultiSigManager.account.address,
          gas: process.env.ETH_GAS_LIMIT,
          gasPrice: new BN(await this.web3.eth.getGasPrice()).mul(new BN(1)), //new BN(process.env.ETH_GAS_PRICE)
        })
        .on('hash', hash => (res.transactionHash = hash));
    } catch (e) {
      console.log('submitTxEth error: ', e.message.slice(0, 100) + '...', res.transactionHash);

      res.error = e.message;
    }

    console.log('submitTxEth status: ', res.status);

    if (!res.transactionHash) {
      return res;
    }

    const txInfoRes = await this.web3.eth.getTransaction(res.transactionHash);

    return { ...res, ...txInfoRes };
  };
}

import { Harmony } from '@harmony-js/core';
import { Contract } from '@harmony-js/contract';
import { Messenger, HttpProvider } from '@harmony-js/network';
import Web3 from 'web3';
import { sleep } from '../utils';
import tokenManagerJson = require('../contracts/TokenManager.json');
import { ethMethodsERC20 } from '../eth';
import logger from '../../logger';
import { createHmySdk } from './index';
const log = logger.module('validator:tokensTracker');

const CHECK_EVENTS_INTERVAL = 30000;

interface ITokenInfo {
  name: string;
  symbol: string;
  decimals: string;
  erc20Address: string;
  hrc20Address: string;
}

interface IGetEventsParams {
  contract: Contract;
  address: string;
  event: string;
  fromBlock: number;
  toBlock: number;
}

export class HmyTokensTracker {
  lastBlock = 0;
  tokenManagerContract: Contract;
  hmySdk: Harmony;
  web3: Web3;
  logsMessenger: Messenger;

  tokens: ITokenInfo[] = [];

  constructor() {
    this.hmySdk = createHmySdk();
    this.web3 = new Web3(`${process.env.ETH_NODE_URL}/${process.env.INFURA_PROJECT_ID}`);
    this.logsMessenger = new Messenger(new HttpProvider(process.env.HMY_NODE_URL));

    this.tokenManagerContract = this.hmySdk.contracts.createContract(
      tokenManagerJson.abi,
      process.env.TOKEN_MANAGER_CONTRACT
    );

    if (process.env.HMY_TOKENS_TRACKER_ENABLE === 'true') {
      this.tokens = [
        {
          name: 'Binance USD',
          symbol: 'BUSD',
          decimals: '18',
          erc20Address: process.env.ETH_BUSD_CONTRACT,
          hrc20Address: process.env.HMY_BUSD_CONTRACT,
        },
        {
          name: 'ChainLink Token',
          symbol: 'LINK',
          decimals: '18',
          erc20Address: process.env.ETH_LINK_CONTRACT,
          hrc20Address: process.env.HMY_LINK_CONTRACT,
        },
      ];

      console.log('HMY_TOKENS_TRACKER_ENABLE: true');

      this.init();
    }
  }

  getTokens = () => {
    return this.tokens;
  };

  getEvents = async (params: IGetEventsParams) => {
    let res = { result: [] };
    const result = [];

    try {
      const topicAddress = params.contract.abiModel.getEvent(params.event).signature;

      try {
        res = await this.logsMessenger.send('hmy_getLogs', [
          {
            fromBlock: '0x' + params.fromBlock.toString(16),
            toBlock: '0x' + params.toBlock.toString(16),
            address: params.address,
            topics: [topicAddress],
          },
        ]);
      } catch (e) {
        log.error('Error get HMY logs: ', { error: e && e.message, params });

        await sleep(5000);

        this.logsMessenger = new Messenger(new HttpProvider(process.env.HMY_NODE_URL));

        res = await this.logsMessenger.send('hmy_getLogs', [
          {
            fromBlock: '0x' + params.fromBlock.toString(16),
            toBlock: '0x' + params.toBlock.toString(16),
            address: params.address,
            topics: [topicAddress],
          },
        ]);
      }

      const logs: any[] = res.result.map(log =>
        this.web3.eth.abi.decodeLog(
          params.contract.abiModel.getEvent(params.event).inputs,
          log.data,
          log.topics.slice(1)
        )
      );

      try {
        for (let j = 0; j < logs.length; j++) {
          const token = logs[j];
          const [name, symbol, decimals] = await ethMethodsERC20.tokenDetails(token.tokenReq);

          result.push({
            erc20Address: token.tokenReq,
            hrc20Address: token.tokenAck,
            name,
            symbol,
            decimals,
          });
        }
      } catch (e) {
        log.error('Error get token details', { error: e && e.message, params });
      }
    } catch (e) {
      log.error('Error getEvents', { error: e && e.message, params });
    }

    return result;
  };

  private init = async () => {
    const res = await this.hmySdk.blockchain.getBlockNumber();
    this.lastBlock = Number(res.result);

    let i = this.lastBlock;
    const step = 30000;

    while (i > 0) {
      const newTokens = await this.getEvents({
        contract: this.tokenManagerContract,
        address: process.env.TOKEN_MANAGER_CONTRACT,
        event: 'TokenMapAck',
        fromBlock: Math.max(i - step, 0),
        toBlock: i,
      });

      this.tokens = this.tokens.concat(newTokens);

      i = i - step;
    }

    console.log('Tokens init success');

    setInterval(this.checkEvents, CHECK_EVENTS_INTERVAL);
  };

  private checkEvents = async () => {
    const res = await this.hmySdk.blockchain.getBlockNumber();
    const latest = Number(res.result);

    if (!this.lastBlock) {
      this.lastBlock = latest - 1000;
    }

    if (latest > this.lastBlock) {
      const newTokens = await this.getEvents({
        contract: this.tokenManagerContract,
        address: process.env.TOKEN_MANAGER_CONTRACT,
        event: 'TokenMapAck',
        fromBlock: this.lastBlock,
        toBlock: latest,
      });

      this.tokens = this.tokens.concat(newTokens);

      this.lastBlock = latest;
    }
  };
}

import { Harmony } from '@harmony-js/core';
import { Contract } from '@harmony-js/contract';
import { HmyMethodsBase } from './HmyMethodsBase';
import { encodeMintTokenErc20 } from './hmy-encoders';
import logger from '../../logger';
const log = logger.module('validator:hmyMethodsERC20');
import { sleep } from '../utils';
import { createHmySdk } from './index';
const tokenJson = require('../contracts/MyERC20.json');
import hmyManagerERC20Json = require('../contracts/HmyManagerERC20.json');

export class HmyMethodsERC20 extends HmyMethodsBase {
  hmySdk: Harmony;
  hmyTokenContract: Contract;
  options = { gasPrice: 1000000000, gasLimit: 6721900 };

  constructor(params) {
    super({ ...params, hmyManagerJson: hmyManagerERC20Json });
  }

  getMappingFor = async erc20TokenAddr => {
    const res = await this.hmyManager.contract.methods.mappings(erc20TokenAddr).call(this.options);

    return res;
  };

  addToken = async (erc20TokenAddr, name, symbol, decimals) => {
    const res = await this.hmyManager.contract.methods
      .addToken(process.env.TOKEN_MANAGER_CONTRACT, erc20TokenAddr, name, symbol, decimals)
      .send(this.options);

    return res;
  };

  mintToken = async (oneTokenAddr, userAddr, amount, receiptId) => {
    // console.log('before MultiSig mintToken: ', receiptId);

    const data = encodeMintTokenErc20(oneTokenAddr, amount, userAddr, receiptId);
    return await this.submitTxHmy(data);
  };

  totalSupply = async hrc20Address => {
    let hmyTokenContract, res;

    try {
      hmyTokenContract = this.hmySdk.contracts.createContract(tokenJson.abi, hrc20Address);
    } catch (e) {
      log.error('this.hmySdk.contracts.createContract', { error: e });

      await sleep(5000);

      this.hmySdk = createHmySdk();

      return 0;
    }

    try {
      res = await hmyTokenContract.methods.totalSupply().call(this.options);
    } catch (e) {
      log.error('hmyTokenContract.methods.totalSupply', { error: e });

      await sleep(5000);

      this.hmySdk = createHmySdk();

      return 0;
    }

    return res;
  };
}

import { TransactionReceipt } from 'web3-core';
import erc20Json = require('../contracts/MyERC20.json');
import { EthMethodsBase } from './EthMethodsBase';
import { encodeUnlockTokenErc20, encodeUnlockEth } from './eth-encoders';

export class EthMethodsERC20 extends EthMethodsBase {
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
      receipt.logs[receipt.logs.length - 1].data,
      receipt.logs[receipt.logs.length - 1].topics.slice(1)
    );
  };

  unlockToken = async (erc20Address, userAddr, amount, receiptId) => {
    console.log('before unlockToken: ', receiptId);

    const data = encodeUnlockTokenErc20(erc20Address, amount, userAddr, receiptId);
    return await this.submitTxEth(data);
  };

  unlockTokenEth = async (userAddr, amount, receiptId) => {
    console.log('before unlockToken: ', receiptId);

    const data = encodeUnlockEth(amount, userAddr, receiptId);
    return await this.submitTxEth(data);
  };

  tokenDetails = async contract => {
    const erc20Contract = new this.web3.eth.Contract(erc20Json.abi as any, contract);
    return [
      await erc20Contract.methods.name().call(),
      await erc20Contract.methods.symbol().call(),
      await erc20Contract.methods.decimals().call(),
    ];
  };
}

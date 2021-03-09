import { TransactionReceipt } from 'web3-core';
import erc20Json = require('../contracts/MyERC20.json');
import { EthMethodsBase } from './EthMethodsBase';
import { encodeUnlockTokenErc721 } from './eth-encoders';

export class EthMethodsERC721 extends EthMethodsBase {
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

  unlockToken = async (erc721Address, userAddr, tokenId, receiptId) => {
    console.log('before unlockTokenErc721: ', receiptId);

    const data = encodeUnlockTokenErc721(erc721Address, tokenId, userAddr, receiptId);
    return await this.submitTxEth(data);
  };

  tokenDetails = async contract => {
    const erc20Contract = new this.web3.eth.Contract(erc20Json.abi as any, contract);
    return [await erc20Contract.methods.name().call(), await erc20Contract.methods.symbol().call()];
  };
}

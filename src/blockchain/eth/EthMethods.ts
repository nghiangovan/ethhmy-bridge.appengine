import { EthMethodsBase } from './EthMethodsBase';
import { encodeUnlockToken } from './eth-encoders';

export class EthMethods extends EthMethodsBase {
  unlockToken = async (userAddr, amount, receiptId) => {
    console.log('before unlockToken: ', receiptId);

    const data = encodeUnlockToken(amount, userAddr, receiptId);
    return await this.submitTxEth(data);
  };
}

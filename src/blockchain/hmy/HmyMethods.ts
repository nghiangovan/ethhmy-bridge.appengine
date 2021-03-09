import { HmyMethodsBase } from './HmyMethodsBase';
import { encodeMintToken } from './hmy-encoders';

export class HmyMethods extends HmyMethodsBase {
  mintToken = async (userAddr, amount, receiptId) => {
    // console.log('before MultiSig mintToken: ', receiptId);

    const data = encodeMintToken(amount, userAddr, receiptId);
    return await this.submitTxHmy(data);
  };
}

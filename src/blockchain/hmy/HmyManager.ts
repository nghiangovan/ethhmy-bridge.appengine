import { Contract } from '@harmony-js/contract';
import { readFileSync } from 'fs';
import { awsKMS } from '../utils';
import { createHmySdk } from './index';

const encryptedDir = './encrypted';

export class HmyManager {
  contract: Contract;
  address: string;
  constructor(contractJson, contractAddr) {
    const hmy = createHmySdk();
    this.contract = hmy.contracts.createContract(contractJson.abi, contractAddr);
    this.address = contractAddr;

    awsKMS.decrypt(
      {
        CiphertextBlob: readFileSync(`${encryptedDir}/hmy-secret`),
      },
      (err, data) => {
        if (!err) {
          const decryptedScret = data['Plaintext'].toString();
          this.call(decryptedScret);
        }
      }
    );
  }

  call = (secret: string) => {
    this.contract.wallet.addByPrivateKey(secret);
  };
}

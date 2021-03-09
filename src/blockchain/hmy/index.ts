import { Harmony } from '@harmony-js/core';
import { ChainType } from '@harmony-js/utils';

import { HmyMethods } from './HmyMethods';

import { HmyMethodsERC20 } from './HmyMethodsERC20';
import { HmyEventsTracker } from './HmyEventsTracker';
import { HmyTokensTracker } from './HmyTokensTracker';
import { HmyMethodsERC721 } from './HmyMethodsERC721';

export * from './HmyMethods';
export * from './HmyMethodsERC20';
export * from './HmyMethodsERC721';

export const createHmySdk = () => {
  return new Harmony(
    // let's assume we deploy smart contract to this end-point URL
    process.env.HMY_NODE_URL,
    {
      chainType: ChainType.Harmony,
      chainId: Number(process.env.HMY_CHAIN_ID),
    }
  );
};

export const hmy = createHmySdk();

const hmyEventsTracker = new HmyEventsTracker({
  hmyManagerMultiSigAddress: process.env.HMY_MULTISIG_WALLET,
});

export const hmyMethodsBUSD = new HmyMethods({
  hmyTokenContractAddress: process.env.HMY_BUSD_CONTRACT,
  hmyManagerAddress: process.env.HMY_BUSD_MANAGER_CONTRACT,
  hmyManagerMultiSigAddress: process.env.HMY_MULTISIG_WALLET,
  hmyEventsTracker,
});

export const hmyMethodsLINK = new HmyMethods({
  hmyTokenContractAddress: process.env.HMY_LINK_CONTRACT,
  hmyManagerAddress: process.env.HMY_LINK_MANAGER_CONTRACT,
  hmyManagerMultiSigAddress: process.env.HMY_MULTISIG_WALLET,
  hmyEventsTracker,
});

// ERC20
// const hmyManagerERC20 = new HmyManager(hmyManagerERC20Json, process.env.HMY_ERC20_MANAGER_CONTRACT);
// fake address - using only for logs decode

export const hmyMethodsERC20 = new HmyMethodsERC20({
  hmyTokenContractAddress: '',
  hmyManagerAddress: process.env.HMY_ERC20_MANAGER_CONTRACT,
  hmyManagerMultiSigAddress: process.env.HMY_MULTISIG_WALLET,
  hmyEventsTracker,
});

export const hmyMethodsERC721 = new HmyMethodsERC721({
  hmyTokenContractAddress: '',
  hmyManagerAddress: process.env.HMY_ERC721_MANAGER_CONTRACT,
  hmyManagerMultiSigAddress: process.env.HMY_MULTISIG_WALLET,
  hmyEventsTracker,
});

export const hmyTokensTracker = new HmyTokensTracker();

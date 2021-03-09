import { Action } from './Action';
import { ACTION_TYPE, OPERATION_TYPE, TOKEN } from './interfaces';
import { createError } from '../../routes/helpers';
import { IOperationInitParams } from './Operation';

import * as hmyContract from '../../blockchain/hmy';
import * as ethContract from '../../blockchain/eth';
import { eventWrapper } from './eventWrapper';

import logger from '../../logger';
const log = logger.module('validator:generateActionsPool');

const ethToOneERC20 = (
  hmyMethods: hmyContract.HmyMethodsERC20,
  ethMethods: ethContract.EthMethodsERC20,
  params: IOperationInitParams
) => {
  const getHRC20AddressAction = new Action({
    type: ACTION_TYPE.getHRC20Address,
    callFunction: async () => {
      let transaction = {};
      let hrc20Address = await hmyMethods.getMappingFor(params.erc20Address);

      if (!Number(hrc20Address)) {
        const [name, symbol, decimals] = await ethMethods.tokenDetails(params.erc20Address);
        transaction = await hmyMethods.addToken(params.erc20Address, name, '1' + symbol, decimals);
        hrc20Address = await hmyMethods.getMappingFor(params.erc20Address);
      }

      return { ...transaction, status: true, hrc20Address };
    },
  });

  const approveEthMangerAction = new Action({
    type: ACTION_TYPE.approveEthManger,
    awaitConfirmation: true,
    callFunction: async hash => await ethMethods.waitTransaction(hash),
  });

  const lockTokenAction = new Action({
    type: ACTION_TYPE.lockToken,
    awaitConfirmation: true,
    callFunction: async hash => await ethMethods.waitTransaction(hash),
  });

  const waitingBlockNumberAction = new Action({
    type: ACTION_TYPE.waitingBlockNumber,
    callFunction: () =>
      ethMethods.waitingBlockNumber(
        lockTokenAction.payload.blockNumber,
        lockTokenAction.payload.transactionHash,
        msg => (waitingBlockNumberAction.message = msg)
      ),
  });

  const mintTokenAction = new Action({
    type: ACTION_TYPE.mintToken,
    startRollbackOnFail: true,
    callFunction: () => {
      return eventWrapper(hmyMethods, 'Minted', lockTokenAction.transactionHash, async () => {
        const approvalLog = ethMethods.decodeApprovalLog(approveEthMangerAction.payload);

        if (approvalLog.spender != ethMethods.ethManager.address) {
          throw new Error('approvalLog.spender != process.env.ETH_MANAGER_CONTRACT');
        }

        const lockTokenLog = ethMethods.decodeLockTokenLog(lockTokenAction.payload);

        if (lockTokenLog.amount != approvalLog.value) {
          throw new Error('lockTokenLog.amount != approvalLog.value');
        }

        const erc20Address = await hmyMethods.getMappingFor(lockTokenLog.token);

        return await hmyMethods.mintToken(
          erc20Address,
          lockTokenLog.recipient,
          lockTokenLog.amount,
          lockTokenAction.transactionHash
        );
      });
    },
  });

  const unlockTokenRollbackAction = new Action({
    type: ACTION_TYPE.unlockTokenRollback,
    callFunction: () => {
      return eventWrapper(ethMethods, 'Unlocked', lockTokenAction.transactionHash, async () => {
        const approvalLog = ethMethods.decodeApprovalLog(approveEthMangerAction.payload);

        if (approvalLog.spender != ethMethods.ethManager.address) {
          throw new Error('approvalLog.spender != process.env.ETH_MANAGER_CONTRACT');
        }

        const lockTokenLog = ethMethods.decodeLockTokenLog(lockTokenAction.payload);

        if (lockTokenLog.amount != approvalLog.value) {
          throw new Error('lockTokenLog.amount != approvalLog.value');
        }

        log.info('unlockTokenRollbackAction', {
          lockTokenLog,
          approvalLog,
          transactionHash: lockTokenAction.transactionHash,
        });

        return await ethMethods.unlockToken(
          lockTokenLog.token,
          lockTokenLog.sender,
          lockTokenLog.amount,
          lockTokenAction.transactionHash
        );
      });
    },
  });

  return {
    actions: [
      getHRC20AddressAction,
      approveEthMangerAction,
      lockTokenAction,
      waitingBlockNumberAction,
      mintTokenAction,
    ],
    rollbackActions: [unlockTokenRollbackAction],
  };
};

const hmyToEthERC20 = (
  hmyMethods: hmyContract.HmyMethodsERC20,
  ethMethods: ethContract.EthMethodsERC20,
  params: IOperationInitParams
) => {
  const approveHmyMangerAction = new Action({
    type: ACTION_TYPE.approveHmyManger,
    awaitConfirmation: true,
    callFunction: hash => hmyMethods.getTransactionReceipt(hash),
  });

  const burnTokenAction = new Action({
    type: ACTION_TYPE.burnToken,
    awaitConfirmation: true,
    callFunction: hash => hmyMethods.getTransactionReceipt(hash),
  });

  // const waitingBlockNumberAction = new Action({
  //   type: ACTION_TYPE.waitingBlockNumberHarmony,
  //   callFunction: () =>
  //     hmyMethods.waitingBlockNumber(
  //       Number(burnTokenAction.payload.blockNumber),
  //       burnTokenAction.payload.transactionHash,
  //       msg => (waitingBlockNumberAction.message = msg)
  //     ),
  // });

  const unlockTokenAction = new Action({
    type: ACTION_TYPE.unlockToken,
    startRollbackOnFail: true,
    callFunction: () => {
      return eventWrapper(ethMethods, 'Unlocked', burnTokenAction.transactionHash, async () => {
        const approvalLog = hmyMethods.decodeApprovalLog(approveHmyMangerAction.payload);

        if (approvalLog.spender.toUpperCase() != hmyMethods.hmyManager.address.toUpperCase()) {
          throw new Error('approvalLog.spender != hmyManager.address');
        }

        const burnTokenLog = hmyMethods.decodeBurnTokenLog(burnTokenAction.payload);

        if (burnTokenLog.amount != approvalLog.value) {
          throw new Error('burnTokenLog.amount != approvalLog.value');
        }

        console.log(
          'before unlockToken',
          params.erc20Address,
          burnTokenLog.recipient,
          burnTokenLog.amount,
          burnTokenAction.transactionHash
        );

        return await ethMethods.unlockToken(
          params.erc20Address,
          burnTokenLog.recipient,
          burnTokenLog.amount,
          burnTokenAction.transactionHash
        );
      });
    },
  });

  const mintTokenRollbackAction = new Action({
    type: ACTION_TYPE.mintTokenRollback,
    callFunction: () => {
      return eventWrapper(hmyMethods, 'Minted', burnTokenAction.transactionHash, async () => {
        const approvalLog = hmyMethods.decodeApprovalLog(approveHmyMangerAction.payload);

        if (approvalLog.spender.toUpperCase() != hmyMethods.hmyManager.address.toUpperCase()) {
          throw new Error('approvalLog.spender != hmyManager.address');
        }

        const burnTokenLog = hmyMethods.decodeBurnTokenLog(burnTokenAction.payload);

        if (burnTokenLog.amount != approvalLog.value) {
          throw new Error('burnTokenLog.amount != approvalLog.value');
        }

        log.info('mintTokenRollbackAction', {
          burnTokenLog,
          approvalLog,
          transactionHash: burnTokenAction.transactionHash,
        });

        return await hmyMethods.mintToken(
          burnTokenLog.token,
          burnTokenLog.sender,
          burnTokenLog.amount,
          burnTokenAction.transactionHash
        );
      });
    },
  });

  return {
    actions: [approveHmyMangerAction, burnTokenAction, unlockTokenAction],
    rollbackActions: [mintTokenRollbackAction],
  };
};

const ethToOne = (hmyMethods: hmyContract.HmyMethods, ethMethods: ethContract.EthMethods) => {
  const approveEthMangerAction = new Action({
    type: ACTION_TYPE.approveEthManger,
    awaitConfirmation: true,
    callFunction: async hash => await ethMethods.waitTransaction(hash),
  });

  const lockTokenAction = new Action({
    type: ACTION_TYPE.lockToken,
    awaitConfirmation: true,
    callFunction: async hash => await ethMethods.waitTransaction(hash),
  });

  const waitingBlockNumberAction = new Action({
    type: ACTION_TYPE.waitingBlockNumber,
    callFunction: () =>
      ethMethods.waitingBlockNumber(
        lockTokenAction.payload.blockNumber,
        lockTokenAction.payload.transactionHash,
        msg => (waitingBlockNumberAction.message = msg)
      ),
  });

  const mintTokenAction = new Action({
    type: ACTION_TYPE.mintToken,
    startRollbackOnFail: true,
    callFunction: () => {
      return eventWrapper(hmyMethods, 'Minted', lockTokenAction.transactionHash, async () => {
        const approvalLog = ethMethods.decodeApprovalLog(approveEthMangerAction.payload);
        if (approvalLog.spender != ethMethods.ethManager.address) {
          throw new Error('approvalLog.spender != process.env.ETH_MANAGER_CONTRACT');
        }

        const lockTokenLog = ethMethods.decodeLockTokenLog(lockTokenAction.payload);
        if (lockTokenLog.amount != approvalLog.value) {
          throw new Error('lockTokenLog.amount != approvalLog.value');
        }

        return await hmyMethods.mintToken(
          lockTokenLog.recipient,
          lockTokenLog.amount,
          lockTokenAction.transactionHash
        );
      });
    },
  });

  const unlockTokenRollbackAction = new Action({
    type: ACTION_TYPE.unlockTokenRollback,
    callFunction: async () => {
      return eventWrapper(ethMethods, 'Unlocked', lockTokenAction.transactionHash, async () => {
        const approvalLog = ethMethods.decodeApprovalLog(approveEthMangerAction.payload);
        if (approvalLog.spender != ethMethods.ethManager.address) {
          throw new Error('approvalLog.spender != process.env.ETH_MANAGER_CONTRACT');
        }

        const lockTokenLog = ethMethods.decodeLockTokenLog(lockTokenAction.payload);
        if (lockTokenLog.amount != approvalLog.value) {
          throw new Error('lockTokenLog.amount != approvalLog.value');
        }

        log.info('unlockTokenRollbackAction', {
          lockTokenLog,
          approvalLog,
          transactionHash: lockTokenAction.transactionHash,
        });

        return await ethMethods.unlockToken(
          lockTokenLog.sender,
          lockTokenLog.amount,
          lockTokenAction.transactionHash
        );
      });
    },
  });

  return {
    actions: [approveEthMangerAction, lockTokenAction, waitingBlockNumberAction, mintTokenAction],
    rollbackActions: [unlockTokenRollbackAction],
  };
};

const hmyToEth = (hmyMethods: hmyContract.HmyMethods, ethMethods: ethContract.EthMethods) => {
  const approveHmyMangerAction = new Action({
    type: ACTION_TYPE.approveHmyManger,
    awaitConfirmation: true,
    callFunction: hash => hmyMethods.getTransactionReceipt(hash),
  });

  const burnTokenAction = new Action({
    type: ACTION_TYPE.burnToken,
    awaitConfirmation: true,
    callFunction: hash => hmyMethods.getTransactionReceipt(hash),
  });

  // const waitingBlockNumberAction = new Action({
  //   type: ACTION_TYPE.waitingBlockNumberHarmony,
  //   callFunction: () =>
  //     hmyMethods.waitingBlockNumber(
  //       Number(burnTokenAction.payload.blockNumber),
  //       burnTokenAction.payload.transactionHash,
  //       msg => (waitingBlockNumberAction.message = msg)
  //     ),
  // });

  const unlockTokenAction = new Action({
    type: ACTION_TYPE.unlockToken,
    startRollbackOnFail: true,
    callFunction: async () => {
      return eventWrapper(ethMethods, 'Unlocked', burnTokenAction.transactionHash, async () => {
        const approvalLog = hmyMethods.decodeApprovalLog(approveHmyMangerAction.payload);

        if (approvalLog.spender.toUpperCase() != hmyMethods.hmyManager.address.toUpperCase()) {
          throw new Error('approvalLog.spender != hmyManager.address');
        }

        const burnTokenLog = hmyMethods.decodeBurnTokenLog(burnTokenAction.payload);

        if (burnTokenLog.amount != approvalLog.value) {
          throw new Error('burnTokenLog.amount != approvalLog.value');
        }

        return await ethMethods.unlockToken(
          burnTokenLog.recipient,
          burnTokenLog.amount,
          burnTokenAction.transactionHash
        );
      });
    },
  });

  const mintTokenRollbackAction = new Action({
    type: ACTION_TYPE.mintTokenRollback,
    callFunction: () => {
      return eventWrapper(hmyMethods, 'Minted', burnTokenAction.transactionHash, async () => {
        const approvalLog = hmyMethods.decodeApprovalLog(approveHmyMangerAction.payload);

        if (approvalLog.spender.toUpperCase() != hmyMethods.hmyManager.address.toUpperCase()) {
          throw new Error('approvalLog.spender != hmyManager.address');
        }

        const burnTokenLog = hmyMethods.decodeBurnTokenLog(burnTokenAction.payload);

        if (burnTokenLog.amount != approvalLog.value) {
          throw new Error('burnTokenLog.amount != approvalLog.value');
        }

        log.info('mintTokenRollbackAction', {
          burnTokenLog,
          approvalLog,
          transactionHash: burnTokenAction.transactionHash,
        });

        return await hmyMethods.mintToken(
          burnTokenLog.sender,
          burnTokenLog.amount,
          burnTokenAction.transactionHash
        );
      });
    },
  });

  return {
    actions: [approveHmyMangerAction, burnTokenAction, unlockTokenAction],
    rollbackActions: [mintTokenRollbackAction],
  };
};

const ethToOneETH = (
  hmyMethods: hmyContract.HmyMethodsERC20,
  ethMethods: ethContract.EthMethodsERC20,
  params: IOperationInitParams
) => {
  const lockTokenAction = new Action({
    type: ACTION_TYPE.lockToken,
    awaitConfirmation: true,
    callFunction: async hash => await ethMethods.waitTransaction(hash),
  });

  const waitingBlockNumberAction = new Action({
    type: ACTION_TYPE.waitingBlockNumber,
    callFunction: () =>
      ethMethods.waitingBlockNumber(
        lockTokenAction.payload.blockNumber,
        lockTokenAction.payload.transactionHash,
        msg => (waitingBlockNumberAction.message = msg)
      ),
  });

  const mintTokenAction = new Action({
    type: ACTION_TYPE.mintToken,
    startRollbackOnFail: true,
    callFunction: () => {
      return eventWrapper(hmyMethods, 'Minted', lockTokenAction.transactionHash, async () => {
        const lockTokenLog = ethMethods.decodeLockTokenLog(lockTokenAction.payload);

        // if (Number(lockTokenLog.amount) != Number(params.amount)) {
        //   throw new Error('lockTokenLog.amount != params.amount');
        // }

        const hrc20Address = process.env.ETH_HRC20;

        return await hmyMethods.mintToken(
          hrc20Address,
          lockTokenLog.recipient,
          lockTokenLog.amount,
          lockTokenAction.transactionHash
        );
      });
    },
  });

  const unlockTokenRollbackAction = new Action({
    type: ACTION_TYPE.unlockTokenRollback,
    callFunction: () => {
      return eventWrapper(ethMethods, 'Unlocked', lockTokenAction.transactionHash, async () => {
        const lockTokenLog = ethMethods.decodeLockTokenLog(lockTokenAction.payload);

        if (lockTokenLog.amount != params.amount) {
          throw new Error('lockTokenLog.amount != params.amount');
        }

        return await ethMethods.unlockTokenEth(
          lockTokenLog.sender,
          lockTokenLog.amount,
          lockTokenAction.transactionHash
        );
      });
    },
  });

  return {
    actions: [lockTokenAction, waitingBlockNumberAction, mintTokenAction],
    rollbackActions: [unlockTokenRollbackAction],
  };
};

const hmyToEthETH = (
  hmyMethods: hmyContract.HmyMethodsERC20,
  ethMethods: ethContract.EthMethodsERC20,
  params: IOperationInitParams
) => {
  const approveHmyMangerAction = new Action({
    type: ACTION_TYPE.approveHmyManger,
    awaitConfirmation: true,
    callFunction: hash => hmyMethods.getTransactionReceipt(hash),
  });

  const burnTokenAction = new Action({
    type: ACTION_TYPE.burnToken,
    awaitConfirmation: true,
    callFunction: hash => hmyMethods.getTransactionReceipt(hash),
  });

  const unlockTokenAction = new Action({
    type: ACTION_TYPE.unlockToken,
    startRollbackOnFail: true,
    callFunction: () => {
      return eventWrapper(ethMethods, 'Unlocked', burnTokenAction.transactionHash, async () => {
        const approvalLog = hmyMethods.decodeApprovalLog(approveHmyMangerAction.payload);

        if (approvalLog.spender.toUpperCase() != hmyMethods.hmyManager.address.toUpperCase()) {
          throw new Error('approvalLog.spender != hmyManager.address');
        }

        const burnTokenLog = hmyMethods.decodeBurnTokenLog(burnTokenAction.payload);

        if (burnTokenLog.amount != approvalLog.value) {
          throw new Error('burnTokenLog.amount != approvalLog.value');
        }

        console.log(
          'before unlockToken',
          params.erc20Address,
          burnTokenLog.recipient,
          burnTokenLog.amount,
          burnTokenAction.transactionHash
        );

        return await ethMethods.unlockTokenEth(
          burnTokenLog.recipient,
          burnTokenLog.amount,
          burnTokenAction.transactionHash
        );
      });
    },
  });

  const mintTokenRollbackAction = new Action({
    type: ACTION_TYPE.mintTokenRollback,
    callFunction: () => {
      return eventWrapper(hmyMethods, 'Minted', burnTokenAction.transactionHash, async () => {
        const approvalLog = hmyMethods.decodeApprovalLog(approveHmyMangerAction.payload);

        if (approvalLog.spender.toUpperCase() != hmyMethods.hmyManager.address.toUpperCase()) {
          throw new Error('approvalLog.spender != hmyManager.address');
        }

        const burnTokenLog = hmyMethods.decodeBurnTokenLog(burnTokenAction.payload);

        if (burnTokenLog.amount != approvalLog.value) {
          throw new Error('burnTokenLog.amount != approvalLog.value');
        }

        log.info('mintTokenRollbackAction', {
          burnTokenLog,
          approvalLog,
          transactionHash: burnTokenAction.transactionHash,
        });

        return await hmyMethods.mintToken(
          burnTokenLog.token,
          burnTokenLog.sender,
          burnTokenLog.amount,
          burnTokenAction.transactionHash
        );
      });
    },
  });

  return {
    actions: [approveHmyMangerAction, burnTokenAction, unlockTokenAction],
    rollbackActions: [mintTokenRollbackAction],
  };
};

const ethToOneERC721 = (
  hmyMethods: hmyContract.HmyMethodsERC721,
  ethMethods: ethContract.EthMethodsERC721,
  params: IOperationInitParams
) => {
  const getHRC20AddressAction = new Action({
    type: ACTION_TYPE.getHRC20Address,
    callFunction: async () => {
      let transaction = {};
      let hrc20Address = await hmyMethods.getMappingFor(params.erc20Address);

      if (!Number(hrc20Address)) {
        const [name, symbol] = await ethMethods.tokenDetails(params.erc20Address);
        transaction = await hmyMethods.addToken(params.erc20Address, name, '1' + symbol);
        hrc20Address = await hmyMethods.getMappingFor(params.erc20Address);
      }

      return { ...transaction, status: true, hrc20Address };
    },
  });

  const approveEthMangerAction = new Action({
    type: ACTION_TYPE.approveEthManger,
    awaitConfirmation: true,
    callFunction: async hash => await ethMethods.waitTransaction(hash),
  });

  const lockTokenAction = new Action({
    type: ACTION_TYPE.lockToken,
    awaitConfirmation: true,
    callFunction: async hash => await ethMethods.waitTransaction(hash),
  });

  const waitingBlockNumberAction = new Action({
    type: ACTION_TYPE.waitingBlockNumber,
    callFunction: () =>
      ethMethods.waitingBlockNumber(
        lockTokenAction.payload.blockNumber,
        lockTokenAction.payload.transactionHash,
        msg => (waitingBlockNumberAction.message = msg)
      ),
  });

  const mintTokenAction = new Action({
    type: ACTION_TYPE.mintToken,
    startRollbackOnFail: true,
    callFunction: () => {
      return eventWrapper(hmyMethods, 'Minted', lockTokenAction.transactionHash, async () => {
        // const approvalLog = ethMethods.decodeApprovalLog(approveEthMangerAction.payload);

        // if (approvalLog.spender != ethMethods.ethManager.address) {
        //   throw new Error('approvalLog.spender != process.env.ETH_MANAGER_CONTRACT');
        // }

        const lockTokenLog = ethMethods.decodeLockTokenLog(lockTokenAction.payload);

        // if (lockTokenLog.amount != approvalLog.value) {
        //   throw new Error('lockTokenLog.amount != approvalLog.value');
        // }

        const erc20Address = await hmyMethods.getMappingFor(lockTokenLog.token);

        return await hmyMethods.mintToken(
          erc20Address,
          lockTokenLog.recipient,
          lockTokenLog.amount,
          lockTokenAction.transactionHash
        );
      });
    },
  });

  const unlockTokenRollbackAction = new Action({
    type: ACTION_TYPE.unlockTokenRollback,
    callFunction: () => {
      return eventWrapper(ethMethods, 'Unlocked', lockTokenAction.transactionHash, async () => {
        // const approvalLog = ethMethods.decodeApprovalLog(approveEthMangerAction.payload);
        //
        // if (approvalLog.spender != ethMethods.ethManager.address) {
        //   throw new Error('approvalLog.spender != process.env.ETH_MANAGER_CONTRACT');
        // }

        const lockTokenLog = ethMethods.decodeLockTokenLog(lockTokenAction.payload);

        // if (lockTokenLog.amount != approvalLog.value) {
        //   throw new Error('lockTokenLog.amount != approvalLog.value');
        // }

        // log.info('unlockTokenRollbackAction', {
        //   lockTokenLog,
        //   approvalLog,
        //   transactionHash: lockTokenAction.transactionHash,
        // });

        return await ethMethods.unlockToken(
          lockTokenLog.token,
          lockTokenLog.sender,
          lockTokenLog.amount,
          lockTokenAction.transactionHash
        );
      });
    },
  });

  return {
    actions: [
      getHRC20AddressAction,
      approveEthMangerAction,
      lockTokenAction,
      waitingBlockNumberAction,
      mintTokenAction,
    ],
    rollbackActions: [unlockTokenRollbackAction],
  };
};

const hmyToEthERC721 = (
  hmyMethods: hmyContract.HmyMethodsERC721,
  ethMethods: ethContract.EthMethodsERC721,
  params: IOperationInitParams
) => {
  const approveHmyMangerAction = new Action({
    type: ACTION_TYPE.approveHmyManger,
    awaitConfirmation: true,
    callFunction: hash => hmyMethods.getTransactionReceipt(hash),
  });

  const burnTokenAction = new Action({
    type: ACTION_TYPE.burnToken,
    awaitConfirmation: true,
    callFunction: hash => hmyMethods.getTransactionReceipt(hash),
  });

  const unlockTokenAction = new Action({
    type: ACTION_TYPE.unlockToken,
    startRollbackOnFail: true,
    callFunction: () => {
      return eventWrapper(ethMethods, 'Unlocked', burnTokenAction.transactionHash, async () => {
        // const approvalLog = hmyMethods.decodeApprovalLog(approveHmyMangerAction.payload);

        // if (approvalLog.spender.toUpperCase() != hmyMethods.hmyManager.address.toUpperCase()) {
        //   throw new Error('approvalLog.spender != hmyManager.address');
        // }

        const burnTokenLog = hmyMethods.decodeBurnTokenLog(burnTokenAction.payload);

        // if (burnTokenLog.amount != approvalLog.value) {
        //   throw new Error('burnTokenLog.amount != approvalLog.value');
        // }

        console.log(
          'before unlockToken',
          params.erc20Address,
          burnTokenLog.recipient,
          burnTokenLog.tokenId,
          burnTokenAction.transactionHash
        );

        return await ethMethods.unlockToken(
          params.erc20Address,
          burnTokenLog.recipient,
          burnTokenLog.tokenId,
          burnTokenAction.transactionHash
        );
      });
    },
  });

  const mintTokenRollbackAction = new Action({
    type: ACTION_TYPE.mintTokenRollback,
    callFunction: () => {
      return eventWrapper(hmyMethods, 'Minted', burnTokenAction.transactionHash, async () => {
        // const approvalLog = hmyMethods.decodeApprovalLog(approveHmyMangerAction.payload);

        // if (approvalLog.spender.toUpperCase() != hmyMethods.hmyManager.address.toUpperCase()) {
        //   throw new Error('approvalLog.spender != hmyManager.address');
        // }

        const burnTokenLog = hmyMethods.decodeBurnTokenLog(burnTokenAction.payload);

        // if (burnTokenLog.amount != approvalLog.value) {
        //   throw new Error('burnTokenLog.amount != approvalLog.value');
        // }

        // log.info('mintTokenRollbackAction', {
        //   burnTokenLog,
        //   approvalLog,
        //   transactionHash: burnTokenAction.transactionHash,
        // });

        return await hmyMethods.mintToken(
          burnTokenLog.token,
          burnTokenLog.sender,
          burnTokenLog.tokenId,
          burnTokenAction.transactionHash
        );
      });
    },
  });

  return {
    actions: [approveHmyMangerAction, burnTokenAction, unlockTokenAction],
    rollbackActions: [mintTokenRollbackAction],
  };
};

export const generateActionsPool = (
  params: IOperationInitParams
): { actions: Array<Action>; rollbackActions: Array<Action> } => {
  if (params.type === OPERATION_TYPE.ONE_ETH) {
    switch (params.token) {
      case TOKEN.BUSD:
        return hmyToEth(hmyContract.hmyMethodsBUSD, ethContract.ethMethodsBUSD);
      case TOKEN.LINK:
        return hmyToEth(hmyContract.hmyMethodsLINK, ethContract.ethMethodsLINK);
      case TOKEN.ERC20:
        return hmyToEthERC20(hmyContract.hmyMethodsERC20, ethContract.ethMethodsERC20, params);
      case TOKEN.ETH:
        return hmyToEthETH(hmyContract.hmyMethodsERC20, ethContract.ethMethodsETH, params);
      case TOKEN.ERC721:
        return hmyToEthERC721(hmyContract.hmyMethodsERC721, ethContract.ethMethodsERC721, params);
    }
  }

  if (params.type === OPERATION_TYPE.ETH_ONE) {
    switch (params.token) {
      case TOKEN.BUSD:
        return ethToOne(hmyContract.hmyMethodsBUSD, ethContract.ethMethodsBUSD);
      case TOKEN.LINK:
        return ethToOne(hmyContract.hmyMethodsLINK, ethContract.ethMethodsLINK);
      case TOKEN.ERC20:
        return ethToOneERC20(hmyContract.hmyMethodsERC20, ethContract.ethMethodsERC20, params);
      case TOKEN.ETH:
        return ethToOneETH(hmyContract.hmyMethodsERC20, ethContract.ethMethodsETH, params);
      case TOKEN.ERC721:
        return ethToOneERC721(hmyContract.hmyMethodsERC721, ethContract.ethMethodsERC721, params);
    }
  }

  throw createError(500, 'Operation or token type not found');
};

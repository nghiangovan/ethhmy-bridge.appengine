import { web3 } from '../eth';

export const encodeUnlockTokenErc20 = (erc20Address, amount, recipient, receiptId) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      constant: false,
      inputs: [
        {
          internalType: 'address',
          name: 'ethTokenAddr',
          type: 'address',
        },
        {
          internalType: 'uint256',
          name: 'amount',
          type: 'uint256',
        },
        {
          internalType: 'address',
          name: 'recipient',
          type: 'address',
        },
        {
          internalType: 'bytes32',
          name: 'receiptId',
          type: 'bytes32',
        },
      ],
      name: 'unlockToken',
      outputs: [],
      payable: false,
      stateMutability: 'nonpayable',
      type: 'function',
    },
    [erc20Address, amount, recipient, receiptId]
  );
};

export const encodeUnlockToken = (amount, recipient, receiptId) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      constant: false,
      inputs: [
        {
          internalType: 'uint256',
          name: 'amount',
          type: 'uint256',
        },
        {
          internalType: 'address',
          name: 'recipient',
          type: 'address',
        },
        {
          internalType: 'bytes32',
          name: 'receiptId',
          type: 'bytes32',
        },
      ],
      name: 'unlockToken',
      outputs: [],
      payable: false,
      stateMutability: 'nonpayable',
      type: 'function',
    },
    [amount, recipient, receiptId]
  );
};

export const encodeUnlockEth = (amount, recipient, receiptId) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      constant: false,
      inputs: [
        {
          internalType: 'uint256',
          name: 'amount',
          type: 'uint256',
        },
        {
          internalType: 'address payable',
          name: 'recipient',
          type: 'address',
        },
        {
          internalType: 'bytes32',
          name: 'receiptId',
          type: 'bytes32',
        },
      ],
      name: 'unlockEth',
      outputs: [],
      payable: false,
      stateMutability: 'nonpayable',
      type: 'function',
    },
    [amount, recipient, receiptId]
  );
};

export const encodeUnlockTokenErc721 = (erc721Address, tokenId, recipient, receiptId) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      constant: false,
      inputs: [
        {
          internalType: 'address',
          name: 'ethTokenAddr',
          type: 'address',
        },
        {
          internalType: 'uint256',
          name: 'tokenId',
          type: 'uint256',
        },
        {
          internalType: 'address',
          name: 'recipient',
          type: 'address',
        },
        {
          internalType: 'bytes32',
          name: 'receiptId',
          type: 'bytes32',
        },
      ],
      name: 'unlockToken',
      outputs: [],
      payable: false,
      stateMutability: 'nonpayable',
      type: 'function',
    },
    [erc721Address, tokenId, recipient, receiptId]
  );
};

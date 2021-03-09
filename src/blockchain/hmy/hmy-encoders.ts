import { web3 } from '../eth';

export const encodeMintTokenErc20 = (hrc20Addr, amount, recipient, transactionHash) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      constant: false,
      inputs: [
        {
          internalType: 'address',
          name: 'oneToken',
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
      name: 'mintToken',
      outputs: [],
      payable: false,
      stateMutability: 'nonpayable',
      type: 'function',
    },
    [hrc20Addr, amount, recipient, transactionHash]
  );
};

export const encodeMintToken = (amount, recipient, receiptId) => {
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
      name: 'mintToken',
      outputs: [],
      payable: false,
      stateMutability: 'nonpayable',
      type: 'function',
    },
    [amount, recipient, receiptId]
  );
};

export const encodeMintTokenErc721 = (hrc20Addr, tokenId, recipient, transactionHash) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      constant: false,
      inputs: [
        {
          internalType: 'address',
          name: 'oneToken',
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
      name: 'mintToken',
      outputs: [],
      payable: false,
      stateMutability: 'nonpayable',
      type: 'function',
    },
    [hrc20Addr, tokenId, recipient, transactionHash]
  );
};

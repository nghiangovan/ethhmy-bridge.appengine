import axios from 'axios';
import { DBService } from '../database';
import { hmyTokensTracker, hmyMethodsERC20, hmyMethodsLINK } from '../../blockchain/hmy';
import logger from '../../logger';
import { divDecimals } from './helpers';

const log = logger.module('validator:tokensService');

export interface IOperationService {
  database: DBService;
}

export interface ITokenInfo {
  name: string;
  symbol: string;
  decimals: string;
  erc20Address: string;
  hrc20Address: string;
  totalLocked: string;
  usdPrice: number;
}

const GET_TOTAL_LOCKED_INTERVAL = 180000;

export class Tokens {
  private database: DBService;
  private dbCollectionName = 'tokens';

  private tokens: ITokenInfo[] = [];

  private priceCache = {};

  private lastPriceUpdate = 0;

  private lastUpdateTime = Date.now();

  private symbolsMap = {
    WETH: 'ETH',
  };

  constructor(params: IOperationService) {
    this.database = params.database;

    setInterval(this.getTotalLocked, GET_TOTAL_LOCKED_INTERVAL);

    this.getTotalLocked();
  }

  getTokenPrice = async (symbol: string) => {
    let usdPrice = 0;

    if (Date.now() - this.lastPriceUpdate < 1000 * 60 * 60 && this.priceCache[symbol]) {
      return this.priceCache[symbol];
    }

    this.lastPriceUpdate = Date.now();

    try {
      const res = await axios.get<{ lastPrice: number }>(
        `https://api.binance.com/api/v1/ticker/24hr?symbol=${symbol}USDT`
      );

      usdPrice = res.data.lastPrice;
    } catch (e) {
      // log.error('get usdPrice api binance', { error: e, token });
    }

    if (!Number(usdPrice)) {
      try {
        const res = await axios.get<{ USD: number; USDT: number }>(
          `https://min-api.cryptocompare.com/data/price?fsym=${symbol}&tsyms=USDT&tsyms=USD`
        );

        usdPrice = res.data.USD || res.data.USDT;
      } catch (e) {
        log.error('get usdPrice cryptocompare', { error: e, symbol });
      }
    }

    if (usdPrice) {
      this.priceCache[symbol] = usdPrice;
      return usdPrice;
    }

    return this.priceCache[symbol] | 0;
  };

  getTotalLocked = async () => {
    const tokens = hmyTokensTracker.getTokens();

    const newTokens = [];

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      let totalSupply = 0;

      try {
        if (token.erc20Address === process.env.ETH_LINK_CONTRACT) {
          const hmyLINKManagerBalance = await hmyMethodsLINK.getBalance(
            process.env.HMY_LINK_MANAGER_CONTRACT
          );

          const initMinted = 100000 * 1e18;

          totalSupply = initMinted - Number(hmyLINKManagerBalance);
        } else {
          totalSupply = await hmyMethodsERC20.totalSupply(token.hrc20Address);
        }
      } catch (e) {
        log.error('get totalSupply', { error: e, token });
        return;
      }

      const usdPrice = await this.getTokenPrice(this.symbolsMap[token.symbol] || token.symbol);

      const totalLockedNormal = divDecimals(totalSupply, token.decimals);

      const totalLockedUSD = Number(totalLockedNormal) * Number(usdPrice);

      newTokens.push({
        ...token,
        totalLocked: String(totalSupply),
        totalLockedNormal,
        usdPrice,
        totalLockedUSD,
      });
    }

    this.tokens = newTokens;
    this.lastUpdateTime = Date.now();
  };

  getAllTokens = (params: { size: number; page: number }) => {
    const from = params.page * params.size;
    const to = (params.page + 1) * params.size;
    const paginationData = this.tokens.slice(from, Math.min(to, this.tokens.length));

    return {
      content: paginationData,
      totalElements: this.tokens.length,
      totalPages: Math.ceil(this.tokens.length / params.size),
      size: params.size,
      page: params.page,
      lastUpdateTime: this.lastUpdateTime,
    };
  };
}

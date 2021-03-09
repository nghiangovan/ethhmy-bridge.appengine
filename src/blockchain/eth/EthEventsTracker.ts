import { EthManager } from '../eth/EthManager';
import Web3 from 'web3';
import { uuidv4 } from '../../services/utils';
import { IEventData } from '../helpers/EventsConstructor';
import { Contract } from 'web3-eth-contract';

const CHECK_EVENTS_INTERVAL = 10000;

interface IEthEventTrackerParams {
  ethMultiSigManager: EthManager;
  web3: Web3;
}

type EventHandler = (event: IEventData) => void;

export class EthEventsTracker {
  lastBlock = 0;
  ethMultiSigManager: EthManager;
  web3: Web3;

  subscribers: Record<string, EventHandler> = {};
  tracks: Record<
    string,
    {
      eventName: string;
      contract: Contract;
      eventHandler: EventHandler;
      hasSubscribers: () => boolean;
    }
  > = {};

  constructor(params: IEthEventTrackerParams) {
    this.web3 = params.web3;
    this.ethMultiSigManager = params.ethMultiSigManager;

    setInterval(this.checkEvents, CHECK_EVENTS_INTERVAL);
  }

  public onEventHandler = (callback: EventHandler) => {
    const id = uuidv4();

    this.subscribers[id] = callback;
  };

  public addTrack = (
    eventName: string,
    contract: Contract,
    eventHandler: EventHandler,
    hasSubscribers: () => boolean
  ) => {
    const id = uuidv4();

    this.tracks[id] = { contract, eventName, eventHandler, hasSubscribers };
  };

  private checkEvents = async () => {
    const latest = await this.web3.eth.getBlockNumber();

    if (latest > this.lastBlock) {
      const submissionEvents = await this.ethMultiSigManager.contract.getPastEvents('Submission', {
        filter: {},
        fromBlock: this.lastBlock,
        toBlock: latest,
      });

      if (submissionEvents.length) {
        console.log('New submission events: ', submissionEvents.length);
      }

      submissionEvents.forEach(async event => {
        const transaction = await this.ethMultiSigManager.contract.methods
          .transactions(event.returnValues.transactionId)
          .call();

        Object.values(this.subscribers).forEach(eventHandler =>
          eventHandler({ ...event, transaction })
        );
      });

      Object.values(this.tracks).map(async track => {
        if (track.hasSubscribers()) {
          const events = await track.contract.getPastEvents(track.eventName, {
            filter: {},
            fromBlock: this.lastBlock,
            toBlock: latest,
          });

          if (events.length) {
            console.log('New unlocked events: ', events.length);
          }

          events.forEach(track.eventHandler);
        }
      });

      this.lastBlock = latest;
    }
  };
}

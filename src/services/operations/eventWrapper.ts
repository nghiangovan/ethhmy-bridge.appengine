import { EventsConstructor } from '../../blockchain/helpers/EventsConstructor';
import logger from '../../logger';
const log = logger.module('validator:eventWrapper');

const WAIT_TIMEOUT = 20 * 60 * 1000; // 20 min
const WAIT_TIMEOUT_SHORT = 5 * 60 * 1000; // 5 min

export const eventWrapper = (
  events: EventsConstructor,
  eventName: string,
  transactionHash: string,
  func: () => Promise<any>
): Promise<{
  status: boolean;
  transactionHash?: string;
}> => {
  return new Promise<{
    status: boolean;
    transactionHash?: string;
  }>(async (resolve, reject) => {
    try {
      let res;

      const timerId = setTimeout(() => {
        log.error(`${eventName}: action rejected by timeout`, { eventName, transactionHash, res });
        reject({ status: false, error: 'Rejected by timeout' });
      }, WAIT_TIMEOUT);

      events.subscribe({
        event: eventName,
        success: event => {
          clearTimeout(timerId);
          resolve({ ...event, status: true });
        },
        failed: err => reject(err.error),
        condition: event => event.returnValues.receiptId === transactionHash,
      });

      res = await func();

      if (!res || res.status !== true) {
        log.warn(`${eventName}: action rejected`, { eventName, transactionHash, res });
      }
    } catch (e) {
      log.error(`${eventName}: exception error`, { eventName, error: e, transactionHash });
      reject({ status: false, error: e.message });
    }
  });
};

export const waitWrapper = (
  func: () => Promise<{
    status: boolean;
    transactionHash?: string;
  }>,
  actionName?: string
): Promise<{
  status: boolean;
  transactionHash?: string;
}> => {
  return new Promise<{
    status: boolean;
    transactionHash?: string;
  }>(async (resolve, reject) => {
    try {
      let res;

      const timerId = setTimeout(() => {
        log.error(`${actionName}: action rejected by timeout`, { actionName, res });
        reject({ status: false, error: 'Rejected by timeout' });
      }, WAIT_TIMEOUT_SHORT);

      res = await func();

      if (!res || res.status !== true) {
        log.warn(`${actionName}: action rejected`, { actionName, res });
      }

      clearTimeout(timerId);

      return res;
    } catch (e) {
      log.error(`${actionName}: exception error`, { actionName, error: e });
      reject({ status: false, error: e.message });
    }
  });
};

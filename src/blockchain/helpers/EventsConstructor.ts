import { uuidv4 } from '../../services/utils';

interface IError {
  error: string;
  status: boolean;
}

// oneToken: string;
// amount: string;
// recipient: string;
// receiptId: string;

export interface IEventData {
  returnValues: {
    [key: string]: any;
  };
  raw: {
    data: string;
    topics: string[];
  };
  event: string;
  signature: string;
  logIndex: number;
  transactionIndex: number;
  transactionHash: string;
  blockHash: string;
  blockNumber: number;
  address: string;
  status?: boolean;
  transaction?: any;
}

export class EventsConstructor {
  subscribers: Record<
    string,
    {
      event: string;
      success: (event: IEventData) => void;
      failed: (event: IError) => void;
      condition: (event: IEventData) => boolean;
    }
  > = {};

  eventHandler = (event: IEventData) => {
    Object.keys(this.subscribers).forEach(id => {
      const sub = this.subscribers[id];

      console.log('New Event: ', event.event);

      if (sub.event === event.event && sub.condition(event)) {
        sub.success({ ...event, status: true });
        this.unsubscribe(id);
      }
    });
  };

  eventErrorHandler = (e: IEventData) => {
    console.log('-- eventErrorHandler --');
    // Object.keys(this.subscribers).forEach(id => {
    //   this.subscribers[id].failed({ error: e.message, status: false });
    //   this.unsubscribe(id);
    // });
  };

  public subscribe = (params: {
    event: string;
    success: (event: IEventData) => void;
    failed: (event: IError) => void;
    condition: (event: IEventData) => boolean;
  }) => {
    const id = uuidv4();

    this.subscribers[id] = params;

    return id;
  };

  public unsubscribe = (id: string) => {
    delete this.subscribers[id];
  };

  isWSConnected = () => {
    return false;
  };
}

import { DBService } from './database';
import { OperationService } from './operations';
import { MintTokens } from './mintTokens';
import { Tokens } from './tokens';

export interface IServices {
  operations: OperationService;
  mintTokens: MintTokens;
  tokens: Tokens;
  database: DBService;
}

export const InitServices = async (): Promise<IServices> => {
  const database = new DBService();

  const operations = new OperationService({ database });
  const mintTokens = new MintTokens({ database });
  const tokens = new Tokens({ database });

  return {
    operations,
    database,
    mintTokens,
    tokens,
  };
};

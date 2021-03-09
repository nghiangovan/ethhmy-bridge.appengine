import { asyncHandler, createError } from './helpers';
import { IServices } from '../services/init';

export const routes = (app, services: IServices) => {
  // create new BUSD transfer operation
  app.post(
    '/operations',
    asyncHandler(async (req, res) => {
      const operation = await services.operations.create(req.body);

      return res.json(operation);
    })
  );

  // get BUSD operation info by ID
  app.get(
    '/operations/:id',
    asyncHandler(async (req, res) => {
      const data = await services.operations.getOperationById(req.params.id);

      if (!data) {
        throw createError(400, 'Operation not found');
      }

      return res.json(data);
    })
  );

  // action confirm
  app.post(
    '/operations/:operationId/actions/:actionType/confirm',
    asyncHandler(async (req, res) => {
      const data = await services.operations.setActionHash({
        operationId: req.params.operationId,
        actionType: req.params.actionType,
        transactionHash: req.body.transactionHash,
      });

      return res.json(data);
    })
  );

  // get all BUSD operations filtered by one|eth address
  app.get(
    '/operations',
    asyncHandler(async (req, res) => {
      const { ethAddress, oneAddress } = req.query;

      const page = parseInt(req.query.page, 10) || 0;
      const size = parseInt(req.query.size, 10) || 50;

      const data = await services.operations.getAllOperations({
        ethAddress,
        oneAddress,
        page,
        size,
      });

      return res.json(data);
    })
  );

  if (process.env.GET_TOKENS_SERVICE === 'true') {
    // mint tokens
    app.post(
      '/get-token',
      asyncHandler(async (req, res) => {
        const data = await services.mintTokens.mint({
          amount: 100,
          address: req.body.address,
          token: req.body.token,
        });

        return res.json(data);
      })
    );
  }

  app.get(
    '/tokens',
    asyncHandler(async (req, res) => {
      const page = parseInt(req.query.page, 10) || 0;
      const size = parseInt(req.query.size, 10) || 50;

      const data = await services.tokens.getAllTokens({
        page,
        size,
      });

      return res.json(data);
    })
  );

  app.get(
    '/version',
    asyncHandler(async (req, res) => {
      return res.json({ version: '9.0.0' });
    })
  );
};

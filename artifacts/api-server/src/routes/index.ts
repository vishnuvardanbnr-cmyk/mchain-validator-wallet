import { Router, type IRouter } from "express";
import healthRouter from "./health";
import chainProxyRouter from "./chain-proxy";
import rpcRouter from "./rpc";
import p2pRouter from "./p2p";
import adminRouter from "./admin";
import legalRouter from "./legal";
import dappsRouter, { ensureDappsTable } from "./dapps";
import tokensRouter, { ensureTokensTable } from "./tokens";
import pricesRouter, { ensurePricesTable } from "./prices";
import monitorRouter from "./monitor";
import cardsRouter, { ensureCardsTables } from "./cards";
import tradingRouter, { ensureTradingTables } from "./trading";

const router: IRouter = Router();

router.use(healthRouter);
router.use(rpcRouter);
router.use(chainProxyRouter);
router.use(p2pRouter);
router.use(adminRouter);
router.use(legalRouter);
router.use(dappsRouter);
router.use(tokensRouter);
router.use(pricesRouter);
router.use(monitorRouter);
router.use(cardsRouter);
router.use(tradingRouter);

export { ensureDappsTable, ensureTokensTable, ensurePricesTable, ensureCardsTables, ensureTradingTables };
export default router;

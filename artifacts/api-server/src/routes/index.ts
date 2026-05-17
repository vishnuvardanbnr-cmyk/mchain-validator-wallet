import { Router, type IRouter } from "express";
import healthRouter from "./health";
import chainProxyRouter from "./chain-proxy";
import rpcRouter from "./rpc";
import p2pRouter from "./p2p";
import adminRouter from "./admin";
import legalRouter from "./legal";
import dappsRouter, { ensureDappsTable } from "./dapps";

const router: IRouter = Router();

router.use(healthRouter);
router.use(rpcRouter);
router.use(chainProxyRouter);
router.use(p2pRouter);
router.use(adminRouter);
router.use(legalRouter);
router.use(dappsRouter);

// Auto-create tables on startup
ensureDappsTable().catch(console.error);

export default router;

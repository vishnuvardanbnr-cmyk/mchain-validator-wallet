import { Router, type IRouter } from "express";
import healthRouter from "./health";
import chainProxyRouter from "./chain-proxy";
import rpcRouter from "./rpc";
import p2pRouter from "./p2p";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(rpcRouter);
router.use(chainProxyRouter);
router.use(p2pRouter);
router.use(adminRouter);

export default router;

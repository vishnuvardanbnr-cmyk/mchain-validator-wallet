import { Router, type IRouter } from "express";
import healthRouter from "./health";
import chainProxyRouter from "./chain-proxy";
import rpcRouter from "./rpc";

const router: IRouter = Router();

router.use(healthRouter);
router.use(rpcRouter);
router.use(chainProxyRouter);

export default router;

import { Router, type IRouter } from "express";
import healthRouter from "./health";
import chainProxyRouter from "./chain-proxy";

const router: IRouter = Router();

router.use(healthRouter);
router.use(chainProxyRouter);

export default router;

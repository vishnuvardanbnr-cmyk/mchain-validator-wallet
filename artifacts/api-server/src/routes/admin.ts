import { Router, type Request, type Response, type NextFunction } from "express";
import { db, pool } from "@workspace/db";
import { p2pProfiles, p2pOrders, p2pDisputes, p2pAds, p2pMessages, appSettings, DEFAULT_VOLUME_TIERS, type VolumeTiers } from "@workspace/db";
import { eq, and, desc, count, sql, asc } from "drizzle-orm";
import { normalizeAddress } from "../escrow";

/** Normalize any incoming address to lowercase 0x ETH format. */
function toEth(addr: string | undefined): string {
  if (!addr) return addr as unknown as string;
  try { return normalizeAddress(addr); } catch { return addr; }
}

const router = Router();

// ── Auth middleware ───────────────────────────────────────────────────────────

function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env["ADMIN_SECRET"];
  if (!secret) {
    res.status(503).json({ error: "Admin secret not configured" });
    return;
  }
  const key = req.headers["x-admin-key"];
  if (!key || key !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

router.use("/admin", adminAuth);

// ── Stats ─────────────────────────────────────────────────────────────────────

router.get("/admin/stats", async (req, res) => {
  const [profileCount] = await db.select({ count: count() }).from(p2pProfiles);
  const [pendingKyc] = await db.select({ count: count() }).from(p2pProfiles)
    .where(eq(p2pProfiles.kycStatus, "pending"));
  const [verifiedKyc] = await db.select({ count: count() }).from(p2pProfiles)
    .where(eq(p2pProfiles.kycStatus, "verified"));
  const [merchantCount] = await db.select({ count: count() }).from(p2pProfiles)
    .where(eq(p2pProfiles.isMerchant, true));
  const [openDisputes] = await db.select({ count: count() }).from(p2pDisputes)
    .where(eq(p2pDisputes.status, "open"));
  const [adCount] = await db.select({ count: count() }).from(p2pAds);
  const [orderCount] = await db.select({ count: count() }).from(p2pOrders);

  res.json({
    totalProfiles: Number(profileCount?.count ?? 0),
    pendingKyc: Number(pendingKyc?.count ?? 0),
    verifiedKyc: Number(verifiedKyc?.count ?? 0),
    merchants: Number(merchantCount?.count ?? 0),
    openDisputes: Number(openDisputes?.count ?? 0),
    totalAds: Number(adCount?.count ?? 0),
    totalOrders: Number(orderCount?.count ?? 0),
  });
});

// ── Profiles ──────────────────────────────────────────────────────────────────

router.get("/admin/profiles", async (req, res) => {
  const page = Math.max(1, Number(req.query["page"] ?? 1));
  const limit = 20;
  const offset = (page - 1) * limit;

  const profiles = await db.select().from(p2pProfiles)
    .orderBy(desc(p2pProfiles.createdAt))
    .limit(limit)
    .offset(offset);

  const [total] = await db.select({ count: count() }).from(p2pProfiles);

  res.json({ profiles, total: Number(total?.count ?? 0), page, limit });
});

// ── KYC ───────────────────────────────────────────────────────────────────────

router.get("/admin/kyc/pending", async (req, res) => {
  const pending = await db.select().from(p2pProfiles)
    .where(eq(p2pProfiles.kycStatus, "pending"))
    .orderBy(p2pProfiles.kycSubmittedAt);

  res.json(pending);
});

router.post("/admin/kyc/:address/approve", async (req, res) => {
  const address = toEth(req.params.address);
  const [updated] = await db.update(p2pProfiles)
    .set({ kycStatus: "verified", kycVerifiedAt: new Date(), updatedAt: new Date() })
    .where(and(
      eq(p2pProfiles.mxcAddress, address),
      eq(p2pProfiles.kycStatus, "pending"),
    ))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Profile not found or not in pending status" });
    return;
  }
  res.json(updated);
});

router.post("/admin/kyc/:address/reject", async (req, res) => {
  const address = toEth(req.params.address);
  const [updated] = await db.update(p2pProfiles)
    .set({ kycStatus: "rejected", updatedAt: new Date() })
    .where(and(
      eq(p2pProfiles.mxcAddress, address),
      eq(p2pProfiles.kycStatus, "pending"),
    ))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Profile not found or not in pending status" });
    return;
  }
  res.json(updated);
});

// ── Merchant ──────────────────────────────────────────────────────────────────

router.post("/admin/merchant/:address/verify", async (req, res) => {
  const address = toEth(req.params.address);
  const [profile] = await db.select().from(p2pProfiles)
    .where(eq(p2pProfiles.mxcAddress, address)).limit(1);

  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  const [updated] = await db.update(p2pProfiles)
    .set({ isMerchant: !profile.isMerchant, updatedAt: new Date() })
    .where(eq(p2pProfiles.mxcAddress, address))
    .returning();

  res.json(updated);
});

router.post("/admin/merchant/:address/pin", async (req, res) => {
  const address = toEth(req.params.address);
  const [profile] = await db.select().from(p2pProfiles)
    .where(eq(p2pProfiles.mxcAddress, address)).limit(1);

  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  const [updated] = await db.update(p2pProfiles)
    .set({ isPinned: !profile.isPinned, updatedAt: new Date() })
    .where(eq(p2pProfiles.mxcAddress, address))
    .returning();

  res.json(updated);
});

// ── Disputes ──────────────────────────────────────────────────────────────────

router.get("/admin/disputes", async (req, res) => {
  const status = (req.query["status"] as string) ?? "open";
  const page = Math.max(1, Number(req.query["page"] ?? 1));
  const limit = 20;
  const offset = (page - 1) * limit;

  const whereClause = status === "all"
    ? sql`true`
    : eq(p2pDisputes.status, status as "open" | "resolved_buyer" | "resolved_seller");

  const disputes = await db
    .select({
      dispute: p2pDisputes,
      order: {
        id: p2pOrders.id,
        buyerAddress: p2pOrders.buyerAddress,
        sellerAddress: p2pOrders.sellerAddress,
        token: p2pOrders.token,
        cryptoAmount: p2pOrders.cryptoAmount,
        fiatAmount: p2pOrders.fiatAmount,
        paymentMethod: p2pOrders.paymentMethod,
        status: p2pOrders.status,
        createdAt: p2pOrders.createdAt,
      },
    })
    .from(p2pDisputes)
    .innerJoin(p2pOrders, eq(p2pDisputes.orderId, p2pOrders.id))
    .where(whereClause)
    .orderBy(desc(p2pDisputes.createdAt))
    .limit(limit)
    .offset(offset);

  const [totalRow] = await db
    .select({ count: count() })
    .from(p2pDisputes)
    .where(whereClause);

  res.json({ disputes, total: Number(totalRow?.count ?? 0), page, limit });
});

router.post("/admin/disputes/:id/resolve", async (req, res) => {
  const { id } = req.params;
  const { resolution, resolvedFor } = req.body as { resolution: string; resolvedFor: "buyer" | "seller" };

  if (!resolution || !resolvedFor || !["buyer", "seller"].includes(resolvedFor)) {
    res.status(400).json({ error: "resolution and resolvedFor (buyer|seller) required" });
    return;
  }

  const disputeStatus = resolvedFor === "buyer" ? "resolved_buyer" : "resolved_seller";

  const [updated] = await db.update(p2pDisputes)
    .set({
      status: disputeStatus,
      resolution,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(p2pDisputes.id, id), eq(p2pDisputes.status, "open")))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Dispute not found or already resolved" });
    return;
  }

  await db.update(p2pOrders)
    .set({ status: "resolved", updatedAt: new Date() })
    .where(eq(p2pOrders.id, updated.orderId));

  res.json(updated);
});

// ── Order chat (admin view + send) ────────────────────────────────────────────

router.get("/admin/orders/:orderId/messages", async (req, res) => {
  const { orderId } = req.params;

  const order = await db.select({ id: p2pOrders.id })
    .from(p2pOrders).where(eq(p2pOrders.id, orderId)).limit(1);
  if (!order.length) { res.status(404).json({ error: "Order not found" }); return; }

  const messages = await db.select().from(p2pMessages)
    .where(eq(p2pMessages.orderId, orderId))
    .orderBy(asc(p2pMessages.createdAt));

  res.json(messages);
});

router.post("/admin/orders/:orderId/message", async (req, res) => {
  const { orderId } = req.params;
  const { content } = req.body as { content?: string };

  if (!content?.trim()) { res.status(400).json({ error: "content required" }); return; }

  const order = await db.select({ id: p2pOrders.id })
    .from(p2pOrders).where(eq(p2pOrders.id, orderId)).limit(1);
  if (!order.length) { res.status(404).json({ error: "Order not found" }); return; }

  const [msg] = await db.insert(p2pMessages).values({
    orderId,
    senderAddress: "ADMIN",
    content: content.trim(),
    isSystem: false,
  }).returning();

  res.status(201).json(msg);
});

// ── Settings ──────────────────────────────────────────────────────────────────

interface PlatformSettings { platformName: string; maintenanceMode: boolean; tradingEnabled: boolean; }
interface TradeSettings { maxOpenOrdersPerUser: number; disputePeriodHours: number; minTradeAmountUsd: number; maxTradeAmountUsd: number; }
interface KycSettings { kycRequiredForAds: boolean; kycRequiredForOrders: boolean; autoRejectAfterDays: number; allowMerchantWithoutKyc: boolean; }

const DEFAULT_PLATFORM: PlatformSettings = { platformName: "MChain P2P", maintenanceMode: false, tradingEnabled: true };
const DEFAULT_TRADE: TradeSettings = { maxOpenOrdersPerUser: 5, disputePeriodHours: 24, minTradeAmountUsd: 1, maxTradeAmountUsd: 10000 };
const DEFAULT_KYC: KycSettings = { kycRequiredForAds: false, kycRequiredForOrders: false, autoRejectAfterDays: 30, allowMerchantWithoutKyc: false };

async function getSetting<T>(key: string, def: T): Promise<T> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  if (!row) return def;
  try { return JSON.parse(row.value) as T; } catch { return def; }
}
async function putSetting(key: string, value: unknown) {
  const v = JSON.stringify(value);
  await db.insert(appSettings).values({ key, value: v }).onConflictDoUpdate({ target: appSettings.key, set: { value: v, updatedAt: new Date() } });
}

router.get("/admin/settings/platform", async (_req, res) => res.json(await getSetting("platform_settings", DEFAULT_PLATFORM)));
router.put("/admin/settings/platform", async (req, res) => {
  const b = req.body as Partial<PlatformSettings>;
  const s: PlatformSettings = { platformName: String(b.platformName ?? DEFAULT_PLATFORM.platformName).slice(0, 80), maintenanceMode: !!b.maintenanceMode, tradingEnabled: b.tradingEnabled !== false };
  await putSetting("platform_settings", s);
  res.json(s);
});

router.get("/admin/settings/trade", async (_req, res) => res.json(await getSetting("trade_settings", DEFAULT_TRADE)));
router.put("/admin/settings/trade", async (req, res) => {
  const b = req.body as Partial<TradeSettings>;
  const s: TradeSettings = { maxOpenOrdersPerUser: Math.max(1, Math.min(50, Number(b.maxOpenOrdersPerUser) || 5)), disputePeriodHours: Math.max(1, Math.min(168, Number(b.disputePeriodHours) || 24)), minTradeAmountUsd: Math.max(1, Number(b.minTradeAmountUsd) || 1), maxTradeAmountUsd: Math.max(100, Number(b.maxTradeAmountUsd) || 10000) };
  if (s.minTradeAmountUsd >= s.maxTradeAmountUsd) { res.status(400).json({ error: "Min must be less than max trade amount" }); return; }
  await putSetting("trade_settings", s);
  res.json(s);
});

router.get("/admin/settings/kyc", async (_req, res) => res.json(await getSetting("kyc_settings", DEFAULT_KYC)));
router.put("/admin/settings/kyc", async (req, res) => {
  const b = req.body as Partial<KycSettings>;
  const s: KycSettings = { kycRequiredForAds: !!b.kycRequiredForAds, kycRequiredForOrders: !!b.kycRequiredForOrders, autoRejectAfterDays: Math.max(1, Math.min(365, Number(b.autoRejectAfterDays) || 30)), allowMerchantWithoutKyc: !!b.allowMerchantWithoutKyc };
  await putSetting("kyc_settings", s);
  res.json(s);
});

const VOLUME_TIERS_KEY = "volume_tiers";

async function getVolumeTiers(): Promise<VolumeTiers> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, VOLUME_TIERS_KEY)).limit(1);
  if (!row) return { ...DEFAULT_VOLUME_TIERS };
  try {
    return JSON.parse(row.value) as VolumeTiers;
  } catch {
    return { ...DEFAULT_VOLUME_TIERS };
  }
}

router.get("/admin/settings/volume-tiers", async (_req, res) => {
  res.json(await getVolumeTiers());
});

router.put("/admin/settings/volume-tiers", async (req, res) => {
  const { bronze, silver, gold, platinum } = req.body as VolumeTiers;
  if (
    typeof bronze !== "number" || typeof silver !== "number" ||
    typeof gold !== "number" || typeof platinum !== "number" ||
    bronze < 1 || silver <= bronze || gold <= silver || platinum <= gold
  ) {
    res.status(400).json({ error: "Invalid tier thresholds — each must be a positive integer, strictly increasing: bronze < silver < gold < platinum" });
    return;
  }
  const value = JSON.stringify({ bronze, silver, gold, platinum });
  await db.insert(appSettings)
    .values({ key: VOLUME_TIERS_KEY, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
  res.json({ bronze, silver, gold, platinum });
});

// ── Escrow management ─────────────────────────────────────────────────────────

router.get("/admin/escrow/info", async (_req, res) => {
  const { isEscrowConfigured, getEscrowAddress } = await import("../escrow");
  res.json({
    configured: isEscrowConfigured(),
    escrowAddress: isEscrowConfigured() ? toEth(getEscrowAddress()) : null,
  });
});

router.get("/admin/escrow/orders", async (req, res) => {
  const { escrowStatus } = req.query as { escrowStatus?: string };
  const filter = escrowStatus ?? "locked";

  const rows = await db.select().from(p2pOrders)
    .where(
      filter === "all"
        ? sql`${p2pOrders.escrowStatus} != 'none'`
        : sql`${p2pOrders.escrowStatus} = ${filter}`
    )
    .orderBy(desc(p2pOrders.createdAt));

  const { isEscrowConfigured, getEscrowAddress } = await import("../escrow");
  res.json({
    orders: rows,
    total: rows.length,
    escrowAddress: isEscrowConfigured() ? toEth(getEscrowAddress()) : null,
  });
});

router.post("/admin/escrow/orders/:id/release", async (req, res) => {
  const { id } = req.params;
  const [order] = await db.select().from(p2pOrders).where(eq(p2pOrders.id, id)).limit(1);
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  if (order.escrowStatus !== "locked") { res.status(400).json({ error: "No locked escrow" }); return; }

  const {
    broadcastMcTransaction, broadcastUsdtTransaction,
    getEscrowAddress, getEscrowPrivateKey, mcToWei, isEscrowConfigured,
  } = await import("../escrow");

  let releaseTxHash: string | null = null;
  if (isEscrowConfigured()) {
    try {
      if (order.token === "MC") {
        releaseTxHash = await broadcastMcTransaction(
          getEscrowAddress(), order.buyerAddress, mcToWei(String(order.cryptoAmount)), getEscrowPrivateKey()
        );
      } else {
        releaseTxHash = await broadcastUsdtTransaction(
          getEscrowPrivateKey(), order.buyerAddress, String(order.cryptoAmount)
        );
      }
    } catch (e) {
      res.status(502).json({ error: `Broadcast failed: ${e instanceof Error ? e.message : "Unknown"}` });
      return;
    }
  }

  const setData: Record<string, unknown> = { escrowStatus: "released", updatedAt: new Date() };
  if (releaseTxHash) setData.releaseTxHash = releaseTxHash;
  if (!["released", "cancelled"].includes(order.status)) {
    setData.status = "released";
    setData.releasedAt = new Date();
  }
  const [updated] = await db.update(p2pOrders).set(setData).where(eq(p2pOrders.id, id)).returning();
  await db.insert(p2pMessages).values({
    orderId: id, senderAddress: "system",
    content: `Admin released ${order.cryptoAmount} ${order.token} from escrow to buyer on-chain.${releaseTxHash ? ` (tx: ${releaseTxHash.slice(0, 12)}…)` : ""}`,
    isSystem: true,
  });
  res.json(updated);
});

router.post("/admin/escrow/orders/:id/refund", async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body as { reason?: string };
  const [order] = await db.select().from(p2pOrders).where(eq(p2pOrders.id, id)).limit(1);
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  if (order.escrowStatus !== "locked") { res.status(400).json({ error: "No locked escrow" }); return; }

  const {
    broadcastMcTransaction, broadcastUsdtTransaction,
    getEscrowAddress, getEscrowPrivateKey, mcToWei, isEscrowConfigured,
  } = await import("../escrow");

  let refundTxHash: string | null = null;
  if (isEscrowConfigured()) {
    try {
      if (order.token === "MC") {
        refundTxHash = await broadcastMcTransaction(
          getEscrowAddress(), order.sellerAddress, mcToWei(String(order.cryptoAmount)), getEscrowPrivateKey()
        );
      } else {
        refundTxHash = await broadcastUsdtTransaction(
          getEscrowPrivateKey(), order.sellerAddress, String(order.cryptoAmount)
        );
      }
    } catch (e) {
      res.status(502).json({ error: `Broadcast failed: ${e instanceof Error ? e.message : "Unknown"}` });
      return;
    }
  }

  const setData: Record<string, unknown> = { escrowStatus: "refunded", updatedAt: new Date() };
  if (refundTxHash) setData.releaseTxHash = refundTxHash;
  const [updated] = await db.update(p2pOrders).set(setData).where(eq(p2pOrders.id, id)).returning();
  await db.insert(p2pMessages).values({
    orderId: id, senderAddress: "system",
    content: `Admin refunded ${order.cryptoAmount} ${order.token} from escrow to seller. Reason: ${reason ?? "Dispute resolution"}.${refundTxHash ? ` (tx: ${refundTxHash.slice(0, 12)}…)` : ""}`,
    isSystem: true,
  });
  res.json(updated);
});

// ── Escrow wallet status + migration ─────────────────────────────────────────

router.get("/admin/escrow/wallet", async (_req, res) => {
  const {
    isEscrowConfigured, getEscrowAddress, normalizeAddress,
  } = await import("../escrow");

  if (!isEscrowConfigured()) {
    res.json({ configured: false, address: null, mc: "0", usdt: "0", lockedOrders: 0 });
    return;
  }

  const rawAddress = getEscrowAddress();
  const address = normalizeAddress(rawAddress);

  const [lockedResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(p2pOrders)
    .where(eq(p2pOrders.escrowStatus, "locked"));

  try {
    const { createPublicClient, http, formatEther, parseAbi } = await import("viem");
    const MCHAIN_RPC = "https://node.mymchain.com/api/rpc";
    const mchain = {
      id: 1888, name: "Mchain",
      nativeCurrency: { name: "MC", symbol: "MC", decimals: 18 },
      rpcUrls: { default: { http: [MCHAIN_RPC] } },
    } as const;
    const client = createPublicClient({ chain: mchain as never, transport: http(MCHAIN_RPC) });

    const [mcResult, usdtResult] = await Promise.allSettled([
      client.getBalance({ address }),
      (async () => {
        const usdtContract = process.env["USDT_CONTRACT_ADDRESS"];
        if (!usdtContract) return 0n;
        const erc20Abi = parseAbi(["function balanceOf(address) view returns (uint256)"]);
        return client.readContract({
          address: usdtContract.toLowerCase() as `0x${string}`,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
        }) as Promise<bigint>;
      })(),
    ]);

    res.json({
      configured: true,
      address: rawAddress,
      mc:   mcResult.status   === "fulfilled" ? parseFloat(formatEther(mcResult.value)).toFixed(6) : "0",
      usdt: usdtResult.status === "fulfilled" ? (Number(usdtResult.value) / 1e6).toFixed(6) : "0",
      lockedOrders: lockedResult?.count ?? 0,
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to fetch balance" });
  }
});

router.post("/admin/escrow/migrate", async (req, res) => {
  const { newAddress, newPrivateKey } = req.body as { newAddress?: string; newPrivateKey?: string };
  if (!newAddress?.trim() || !newPrivateKey?.trim()) {
    res.status(400).json({ error: "newAddress and newPrivateKey are required" });
    return;
  }

  const {
    isEscrowConfigured, getEscrowAddress, getEscrowPrivateKey,
    normalizeAddress, broadcastMcTransaction, broadcastUsdtTransaction,
    mcToWei, saveEscrowConfig,
  } = await import("../escrow");

  // If no existing config, just save the new one directly
  if (!isEscrowConfigured()) {
    saveEscrowConfig(newAddress.trim(), newPrivateKey.trim());
    res.json({ migrated: false, newAddress: newAddress.trim(), message: "Escrow wallet saved — no prior wallet to migrate from." });
    return;
  }

  const oldAddress = getEscrowAddress();
  const oldPk      = getEscrowPrivateKey();
  const oldEth     = normalizeAddress(oldAddress);

  // ── Fetch current balances ────────────────────────────────────────────────
  const { createPublicClient, http, formatEther, parseAbi } = await import("viem");
  const MCHAIN_RPC = "https://node.mymchain.com/api/rpc";
  const mchain = {
    id: 1888, name: "Mchain",
    nativeCurrency: { name: "MC", symbol: "MC", decimals: 18 },
    rpcUrls: { default: { http: [MCHAIN_RPC] } },
  } as const;
  const client = createPublicClient({ chain: mchain as never, transport: http(MCHAIN_RPC) });

  let mcWei = 0n, usdtRaw = 0n;
  try {
    mcWei = await client.getBalance({ address: oldEth });
  } catch { /* leave 0 */ }

  const usdtContract = process.env["USDT_CONTRACT_ADDRESS"];
  if (usdtContract) {
    try {
      const erc20Abi = parseAbi(["function balanceOf(address) view returns (uint256)"]);
      usdtRaw = await client.readContract({
        address: usdtContract.toLowerCase() as `0x${string}`,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [oldEth],
      }) as bigint;
    } catch { /* leave 0 */ }
  }

  const txHashes: { mc?: string; usdt?: string } = {};
  const GAS_RESERVE = BigInt(mcToWei("0.05")); // reserve 0.05 MC for gas

  // ── Move USDT first (it costs MC gas) ────────────────────────────────────
  if (usdtRaw > 0n) {
    try {
      const usdtAmount = (Number(usdtRaw) / 1e6).toFixed(6);
      txHashes.usdt = await broadcastUsdtTransaction(oldPk, newAddress.trim(), usdtAmount);
    } catch (e) {
      res.status(502).json({ error: `USDT transfer failed: ${e instanceof Error ? e.message : "Unknown"}` });
      return;
    }
  }

  // ── Move MC (leave gas reserve) ───────────────────────────────────────────
  const sendableMc = mcWei > GAS_RESERVE ? mcWei - GAS_RESERVE : 0n;
  if (sendableMc > 0n) {
    try {
      txHashes.mc = await broadcastMcTransaction(oldAddress, newAddress.trim(), sendableMc.toString(), oldPk);
    } catch (e) {
      res.status(502).json({
        error: `MC transfer failed: ${e instanceof Error ? e.message : "Unknown"}`,
        partialTxHashes: txHashes,
      });
      return;
    }
  }

  // ── Persist new config ────────────────────────────────────────────────────
  saveEscrowConfig(newAddress.trim(), newPrivateKey.trim());

  res.json({
    migrated: true,
    oldAddress,
    newAddress: newAddress.trim(),
    mcMoved:   sendableMc > 0n ? parseFloat(formatEther(sendableMc)).toFixed(6) : "0",
    usdtMoved: usdtRaw   > 0n ? (Number(usdtRaw) / 1e6).toFixed(6) : "0",
    txHashes,
  });
});

// ── API Keys (stored in DB, admin-only) ──────────────────────────────────────

const ALLOWED_API_KEYS = [
  { name: "stripe_secret_key",    label: "Stripe Secret Key",      hint: "sk_live_ or sk_test_" },
  { name: "card_issuer_api_key",  label: "Card Issuer API Key",     hint: "Immersve / M2P key" },
  { name: "bscscan_api_key",      label: "BSCScan API Key",         hint: "Optional — for BSC monitoring" },
  { name: "sendgrid_api_key",     label: "SendGrid API Key",        hint: "Email notifications" },
] as const;

type AllowedKeyName = (typeof ALLOWED_API_KEYS)[number]["name"];

async function ensureApiKeysTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS platform_api_keys (
      key_name TEXT PRIMARY KEY,
      key_value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}
ensureApiKeysTable().catch(() => {});

function maskKey(value: string): string {
  if (value.length <= 8) return "••••••••";
  return value.slice(0, 7) + "•".repeat(Math.min(16, value.length - 11)) + value.slice(-4);
}

router.get("/admin/api-keys", async (_req, res): Promise<void> => {
  try {
    const result = await pool.query(
      "SELECT key_name, key_value, updated_at FROM platform_api_keys"
    );
    const stored = new Map(result.rows.map((r: { key_name: string; key_value: string; updated_at: string }) =>
      [r.key_name, { value: r.key_value, updated_at: r.updated_at }]
    ));

    const keys = ALLOWED_API_KEYS.map(({ name, label, hint }) => {
      const entry = stored.get(name);
      return {
        name,
        label,
        hint,
        configured: !!entry,
        masked: entry ? maskKey(entry.value) : null,
        updated_at: entry?.updated_at ?? null,
      };
    });

    res.json({ keys });
  } catch {
    res.status(500).json({ error: "Failed to fetch API keys" });
  }
});

router.put("/admin/api-keys/:keyName", async (req, res): Promise<void> => {
  const keyName = req.params["keyName"] as AllowedKeyName;
  const { value } = req.body as { value?: string };

  if (!ALLOWED_API_KEYS.find((k) => k.name === keyName)) {
    res.status(400).json({ error: "Unknown key name" });
    return;
  }
  if (!value || typeof value !== "string" || value.trim().length < 8) {
    res.status(400).json({ error: "Key value must be at least 8 characters" });
    return;
  }

  try {
    await pool.query(
      `INSERT INTO platform_api_keys (key_name, key_value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key_name) DO UPDATE SET key_value = $2, updated_at = NOW()`,
      [keyName, value.trim()]
    );
    res.json({ success: true, masked: maskKey(value.trim()) });
  } catch {
    res.status(500).json({ error: "Failed to save API key" });
  }
});

router.delete("/admin/api-keys/:keyName", async (req, res): Promise<void> => {
  const keyName = req.params["keyName"] as AllowedKeyName;
  if (!ALLOWED_API_KEYS.find((k) => k.name === keyName)) {
    res.status(400).json({ error: "Unknown key name" }); return;
  }
  try {
    await pool.query("DELETE FROM platform_api_keys WHERE key_name = $1", [keyName]);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to delete API key" });
  }
});

export default router;

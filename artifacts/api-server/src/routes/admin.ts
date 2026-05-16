import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { p2pProfiles, p2pOrders, p2pDisputes, p2pAds, p2pMessages, appSettings, DEFAULT_VOLUME_TIERS, type VolumeTiers } from "@workspace/db";
import { eq, and, desc, count, sql, asc } from "drizzle-orm";

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
  const { address } = req.params;
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
  const { address } = req.params;
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
  const { address } = req.params;
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
    escrowAddress: isEscrowConfigured() ? getEscrowAddress() : null,
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
    escrowAddress: isEscrowConfigured() ? getEscrowAddress() : null,
  });
});

router.post("/admin/escrow/orders/:id/release", async (req, res) => {
  const { id } = req.params;
  const [order] = await db.select().from(p2pOrders).where(eq(p2pOrders.id, id)).limit(1);
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  if (order.escrowStatus !== "locked") { res.status(400).json({ error: "No locked escrow" }); return; }

  const { broadcastMcTransaction, getEscrowAddress, getEscrowPrivateKey, mcToWei, isEscrowConfigured } = await import("../escrow");
  let releaseTxHash: string | null = null;

  if (order.token === "MC" && isEscrowConfigured()) {
    try {
      releaseTxHash = await broadcastMcTransaction(
        getEscrowAddress(), order.buyerAddress, mcToWei(String(order.cryptoAmount)), getEscrowPrivateKey()
      );
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
    content: `Admin released escrow to buyer.${releaseTxHash ? ` (tx: ${releaseTxHash.slice(0, 12)}…)` : " USDT will be sent manually."}`,
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

  const { broadcastMcTransaction, getEscrowAddress, getEscrowPrivateKey, mcToWei, isEscrowConfigured } = await import("../escrow");
  let refundTxHash: string | null = null;

  if (order.token === "MC" && isEscrowConfigured()) {
    try {
      refundTxHash = await broadcastMcTransaction(
        getEscrowAddress(), order.sellerAddress, mcToWei(String(order.cryptoAmount)), getEscrowPrivateKey()
      );
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
    content: `Admin refunded escrow to seller. Reason: ${reason ?? "Dispute resolution"}.${refundTxHash ? ` (tx: ${refundTxHash.slice(0, 12)}…)` : ""}`,
    isSystem: true,
  });
  res.json(updated);
});

export default router;

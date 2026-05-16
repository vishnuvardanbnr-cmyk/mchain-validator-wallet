import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { p2pProfiles, p2pOrders, p2pDisputes, p2pAds, p2pMessages } from "@workspace/db";
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
  const page = Number(req.query["page"] ?? 1);
  const limit = 50;
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
    .where(
      status === "all"
        ? sql`true`
        : eq(p2pDisputes.status, status as "open" | "resolved_buyer" | "resolved_seller"),
    )
    .orderBy(desc(p2pDisputes.createdAt));

  res.json(disputes);
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

export default router;

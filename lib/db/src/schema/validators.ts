import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const validatorSubWallets = pgTable("validator_sub_wallets", {
  id: uuid("id").primaryKey().defaultRandom(),
  validatorAddress: text("validator_address").notNull(),
  subWalletAddress: text("sub_wallet_address").notNull().unique(),
  status: text("status").notNull().default("verified"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ValidatorSubWallet = typeof validatorSubWallets.$inferSelect;

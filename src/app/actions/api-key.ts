"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PLANS, SubscriptionTier } from "@/lib/plans";
import { createHash, randomBytes } from "crypto";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function generateApiKey() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Oturum açmanız gerekiyor.");
  const userId = session.user.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionTier: true },
  });
  const tier = (user?.subscriptionTier as SubscriptionTier) || "FREE";
  const plan = PLANS[tier] || PLANS.FREE;
  if (!plan.features.apiAccess) {
    throw new Error("API erişimi sadece Business planında aktif.");
  }

  const token = `zakrom_${randomBytes(24).toString("hex")}`;
  await prisma.user.update({
    where: { id: userId },
    data: { apiKeyHash: hashToken(token) },
  });

  return { apiKey: token };
}

export async function revokeApiKey() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Oturum açmanız gerekiyor.");
  const userId = session.user.id;

  await prisma.user.update({
    where: { id: userId },
    data: { apiKeyHash: null },
  });

  return { ok: true };
}

export async function getApiKeyStatus() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Oturum açmanız gerekiyor.");
  const userId = session.user.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { apiKeyHash: true },
  });

  return { hasKey: Boolean(user?.apiKeyHash) };
}

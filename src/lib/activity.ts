import { prisma } from "./prisma";
import { getUserId } from "./auth-utils";

export async function logActivity(
  entityType: string,
  entityId: string,
  action: string,
  description: string
) {
  const userId = await getUserId();
  if (!userId) return null;
  return prisma.activityLog.create({
    data: { userId, entityType, entityId, action, description },
  });
}

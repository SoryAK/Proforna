import { prisma } from "./prisma";

export async function logActivity(
  entityType: string,
  entityId: string,
  action: string,
  description: string
) {
  return prisma.activityLog.create({
    data: { entityType, entityId, action, description },
  });
}

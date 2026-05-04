const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.userProfile.findMany({
  select: { id: true, homeLat: true, homeLng: true, maxCommuteMiles: true, city: true, state: true, irSlug: true }
}).then((r) => {
  console.log(JSON.stringify(r, null, 2));
  return p.$disconnect();
});

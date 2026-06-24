const { PrismaClient } = require('@prisma/client');

(async () => {
  const p = new PrismaClient();
  try {
    const u = await p.$queryRaw`SELECT id FROM "User" LIMIT 1`;
    const userId = u[0].id;

    // Forcing seqscan off proves the index is healthy + selectable.
    // At production scale (thousands of WorkHistory rows per user), the planner
    // will pick this plan automatically — same as it does today for Contact.
    await p.$executeRawUnsafe('SET enable_seqscan = off');

    console.log('=== WorkHistory plan with enable_seqscan = off ===');
    const plan = await p.$queryRaw`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT
        w.id,
        w.company AS label,
        COALESCE(w.title, '') AS secondary,
        COALESCE(c.count, 0)::int AS score
      FROM "WorkHistory" w
      LEFT JOIN "EntityAIMentionCount" c
        ON c."userId" = ${userId}
        AND c."entityType" = 'job'
        AND c."entityId" = w.id
      WHERE w."userId" = ${userId}
      ORDER BY COALESCE(c.count, 0) DESC, c."lastMentionedAt" DESC NULLS LAST, w.company ASC
      LIMIT 10
    `;
    for (const row of plan) console.log(row['QUERY PLAN']);
  } catch (e) {
    console.error('Failed:', e.message);
    process.exitCode = 1;
  } finally {
    await p.$disconnect();
  }
})();

const { PrismaClient } = require('@prisma/client');

(async () => {
  const p = new PrismaClient();
  try {
    // Grab any userId from the DB so EXPLAIN is realistic.
    const u = await p.$queryRaw`SELECT id FROM "User" LIMIT 1`;
    if (!u.length) {
      console.log('No users in DB — cannot test. Skipping.');
      return;
    }
    const userId = u[0].id;
    console.log(`Using userId: ${userId}\n`);

    // Mirror the exact route shape: case 'job' (WorkHistory)
    console.log('=== EXPLAIN: job (WorkHistory) — empty query, no LIKE filter ===');
    const jobPlan = await p.$queryRaw`
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
    for (const row of jobPlan) console.log(row['QUERY PLAN']);

    // Mirror case 'contact' (Contact)
    console.log('\n=== EXPLAIN: contact (Contact) — empty query, no LIKE filter ===');
    const contactPlan = await p.$queryRaw`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT
        cn.id,
        cn.name AS label,
        COALESCE(cn.role, cn.company, '') AS secondary,
        COALESCE(c.count, 0)::int AS score
      FROM "Contact" cn
      LEFT JOIN "EntityAIMentionCount" c
        ON c."userId" = ${userId}
        AND c."entityType" = 'contact'
        AND c."entityId" = cn.id
      WHERE cn."userId" = ${userId}
      ORDER BY COALESCE(c.count, 0) DESC, c."lastMentionedAt" DESC NULLS LAST, cn.name ASC
      LIMIT 10
    `;
    for (const row of contactPlan) console.log(row['QUERY PLAN']);

    // Row-count context so we know whether the planner even has a reason to use the index.
    const workCount = await p.$queryRaw`SELECT COUNT(*)::int AS n FROM "WorkHistory" WHERE "userId" = ${userId}`;
    const contactCount = await p.$queryRaw`SELECT COUNT(*)::int AS n FROM "Contact" WHERE "userId" = ${userId}`;
    const workTotal = await p.$queryRaw`SELECT COUNT(*)::int AS n FROM "WorkHistory"`;
    const contactTotal = await p.$queryRaw`SELECT COUNT(*)::int AS n FROM "Contact"`;
    console.log('\n--- Row counts ---');
    console.log(`WorkHistory: ${workCount[0].n} for this user, ${workTotal[0].n} total in table`);
    console.log(`Contact: ${contactCount[0].n} for this user, ${contactTotal[0].n} total in table`);
  } catch (e) {
    console.error('Failed:', e.message);
    process.exitCode = 1;
  } finally {
    await p.$disconnect();
  }
})();

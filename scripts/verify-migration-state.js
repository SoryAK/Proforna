const { PrismaClient } = require('@prisma/client');

(async () => {
  const p = new PrismaClient();
  try {
    const n = await p.$executeRaw`
      DELETE FROM _prisma_migrations
      WHERE migration_name = '20260624094839_m1'
    `;
    console.log('Deleted m1 row:', n);

    const indexes = await p.$queryRaw`
      SELECT tablename, indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN ('Contact_userId_idx', 'Residence_userId_idx', 'WorkHistory_userId_idx')
      ORDER BY indexname
    `;
    console.log('\nUserId indexes in DB:');
    console.log(JSON.stringify(indexes, null, 2));

    const failed = await p.$queryRaw`
      SELECT migration_name, finished_at, rolled_back_at
      FROM _prisma_migrations
      WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL
      ORDER BY started_at DESC
      LIMIT 5
    `;
    console.log('\nAny unfinished/rolled-back migrations:');
    console.log(JSON.stringify(failed, null, 2));
  } catch (e) {
    console.error('Failed:', e.message);
    process.exitCode = 1;
  } finally {
    await p.$disconnect();
  }
})();

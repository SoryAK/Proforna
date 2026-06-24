const { PrismaClient } = require('@prisma/client');

(async () => {
  const p = new PrismaClient();
  try {
    const before = await p.$queryRaw`
      SELECT migration_name, finished_at IS NULL AS unfinished
      FROM _prisma_migrations
      WHERE migration_name IN (
        SELECT migration_name FROM _prisma_migrations GROUP BY migration_name HAVING COUNT(*) > 1
      )
      ORDER BY migration_name, started_at
    `;
    console.log('Before — duplicate rows:');
    console.log(JSON.stringify(before, null, 2));

    const deleted = await p.$executeRaw`
      DELETE FROM _prisma_migrations a
      WHERE a.finished_at IS NULL
        AND EXISTS (
          SELECT 1 FROM _prisma_migrations b
          WHERE b.migration_name = a.migration_name
            AND b.finished_at IS NOT NULL
        )
    `;
    console.log('\nRows deleted:', deleted);

    const after = await p.$queryRaw`
      SELECT migration_name, COUNT(*)::int AS n
      FROM _prisma_migrations
      GROUP BY migration_name
      HAVING COUNT(*) > 1
    `;
    console.log('\nAfter — remaining duplicates:');
    console.log(JSON.stringify(after, null, 2));
  } catch (e) {
    console.error('Failed:', e.message);
    process.exitCode = 1;
  } finally {
    await p.$disconnect();
  }
})();

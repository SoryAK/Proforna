const { PrismaClient } = require('@prisma/client');

(async () => {
  const p = new PrismaClient();
  try {
    const before = await p.$queryRaw`
      SELECT migration_name, finished_at, rolled_back_at
      FROM _prisma_migrations
      WHERE migration_name = '20260624094350_add_userid_index_workhistory_contact'
    `;
    console.log('Before:');
    console.log(JSON.stringify(before, null, 2));

    const n = await p.$executeRaw`
      DELETE FROM _prisma_migrations
      WHERE migration_name = '20260624094350_add_userid_index_workhistory_contact'
    `;
    console.log('\nDeleted rows:', n);
  } catch (e) {
    console.error('Failed:', e.message);
    process.exitCode = 1;
  } finally {
    await p.$disconnect();
  }
})();

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

(async () => {
  const p = new PrismaClient();
  try {
    const rows = await p.$queryRaw`
      SELECT migration_name, checksum, finished_at IS NOT NULL AS applied
      FROM _prisma_migrations
      WHERE migration_name = '20260615170725_add_worklog_linked_contact_ids'
    `;
    console.log('DB row:');
    console.log(JSON.stringify(rows, null, 2));

    const file = path.join('prisma', 'migrations', '20260615170725_add_worklog_linked_contact_ids', 'migration.sql');
    const buf = fs.readFileSync(file);
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    console.log('\nOn-disk sha256:', sha);
    console.log('On-disk byte length:', buf.length);
    console.log('On-disk has CR (\\r) bytes:', buf.includes(0x0d));
    console.log('On-disk leading bytes:', buf.slice(0, 16).toString('hex'));

    const dups = await p.$queryRaw`
      SELECT migration_name,
             COUNT(*)::int AS n,
             SUM(CASE WHEN finished_at IS NULL THEN 1 ELSE 0 END)::int AS unfinished
      FROM _prisma_migrations
      GROUP BY migration_name
      HAVING COUNT(*) > 1
    `;
    console.log('\nMigrations with duplicate rows:');
    console.log(JSON.stringify(dups, null, 2));
  } catch (e) {
    console.error('Query failed:', e.message);
  } finally {
    await p.$disconnect();
  }
})();

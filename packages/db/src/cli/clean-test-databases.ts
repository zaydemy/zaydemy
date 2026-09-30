// Drops every test database on TEST_DATABASE_URL, e.g. after interrupted runs
// (a killed Vitest process skips its teardown). Test runs also drop leftovers
// older than an hour on their own.
import "./env";
import { dropDatabase, testDatabasePrefix, withServer } from "../testing/server";

const dropped = await withServer(async (sql) => {
  const rows = await sql<{ datname: string }[]>`
    select datname from pg_database where starts_with(datname, ${testDatabasePrefix})
  `;
  for (const { datname } of rows) await dropDatabase(sql, datname);
  return rows.length;
});
console.log(`[db] dropped ${dropped} test database(s)`);

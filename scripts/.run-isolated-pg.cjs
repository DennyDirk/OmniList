const { spawnSync } = require('node:child_process');
require('dotenv').config({ quiet: true });
if (!process.env.TEST_DATABASE_URL) process.env.TEST_DATABASE_URL = process.env.DATABASE_URL;
if (!process.env.TEST_DATABASE_URL) throw new Error('Database configuration is missing');
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', '--test-reporter=spec', 'scripts/integration/product-import.pg.test.ts'], {
  stdio: 'inherit', windowsHide: true, env: process.env
});
process.exit(result.status ?? 1);

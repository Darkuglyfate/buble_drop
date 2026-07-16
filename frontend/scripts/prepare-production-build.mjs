import fs from 'node:fs';
import path from 'node:path';

const workspaceRoot = process.cwd();
const smokeDirectory = path.join(workspaceRoot, '.next-smoke');

if (fs.existsSync(smokeDirectory)) {
  const productionDirectory = path.join(workspaceRoot, '.next');
  fs.mkdirSync(productionDirectory, { recursive: true });

  const quarantineDirectory = path.join(
    productionDirectory,
    `smoke-stale-${process.pid}-${Date.now()}`,
  );

  fs.renameSync(smokeDirectory, quarantineDirectory);
}

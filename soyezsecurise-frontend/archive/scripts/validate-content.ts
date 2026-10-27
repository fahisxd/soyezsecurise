import { readCatalog } from './catalog';
const catalog = readCatalog();
for (const issue of catalog.issues) console.error(`${issue.file}: ${issue.message}`);
console.log(`${catalog.records.length} published, ${catalog.ignored} unpublished, ${catalog.issues.length} invalid.`);
if (catalog.issues.length) process.exitCode = 1;

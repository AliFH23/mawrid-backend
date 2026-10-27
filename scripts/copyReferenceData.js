import mongoose from 'mongoose';
import dns from 'dns';

// local-only: works around the Node-on-Windows SRV lookup bug
dns.setServers(['8.8.8.8', '1.1.1.1']);

const { SRC_URI, DEST_URI } = process.env;
if (!SRC_URI || !DEST_URI) {
  console.error('Set SRC_URI and DEST_URI first');
  process.exit(1);
}

const apply = process.argv.includes('--apply');

// collection name -> filter of what to copy
const PLAN = [
  ['categories', {}],
  ['governorates', {}],
  ['deliveryzones', {}],
  ['platformsettings', {}],
  ['users', { role: 'admin' }],
];

const src = await mongoose.createConnection(SRC_URI).asPromise();
const dest = await mongoose.createConnection(DEST_URI).asPromise();

console.log(`source DB: ${src.name}`);
console.log(`dest   DB: ${dest.name}`);
console.log(
  'source collections:',
  (await src.db.listCollections().toArray()).map((c) => c.name).join(', ')
);

if (src.name === dest.name) {
  console.error('Source and destination database names are the same — aborting');
  process.exit(1);
}

console.log(apply ? '\nMODE: APPLY\n' : '\nMODE: DRY RUN (add --apply to write)\n');

for (const [name, filter] of PLAN) {
  const docs = await src.db.collection(name).find(filter).toArray();
  const existing = await dest.db.collection(name).countDocuments(filter);
  console.log(`${name}: ${docs.length} in source, ${existing} already in destination`);

  if (!apply || docs.length === 0) continue;

  const ops = docs.map((d) => ({
    replaceOne: { filter: { _id: d._id }, replacement: d, upsert: true },
  }));
  await dest.db.collection(name).bulkWrite(ops);
  console.log(`  copied ${docs.length}`);
}

await src.close();
await dest.close();
console.log('\nDone');
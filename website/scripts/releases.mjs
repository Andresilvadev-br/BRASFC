import { writeFile } from 'node:fs/promises';
import { fetchReleases } from '../src/releases.mjs';
const result = await fetchReleases();
await writeFile(
  new URL('../src/release-snapshot.json', import.meta.url),
  JSON.stringify({ ...result, releases: result.releases.slice(0, 12) }, null, 2) + '\n'
);

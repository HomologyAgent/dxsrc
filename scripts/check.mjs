import {access, readFile} from 'node:fs/promises';
import {dirname, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const localFile = async path => {
  assert(typeof path === 'string' && path.length > 0, 'plugin path is missing');
  const relative = path.replace(/^\.\//, '');
  const absolute = resolve(root, relative);
  assert(absolute.startsWith(root + sep), `plugin path escapes release root: ${path}`);
  await access(absolute);
};
const validateConfig = async (path, publishedKeys) => {
  const config = await readJson(path);
  assert(typeof config.name === 'string' && Array.isArray(config.sites), `${path}: invalid config`);
  const keys = new Set();
  for (const site of config.sites) {
    assert(site && typeof site.key === 'string' && typeof site.name === 'string', `${path}: invalid site`);
    assert(!keys.has(site.key), `${path}: duplicate key ${site.key}`);
    assert(publishedKeys.has(site.key), `${path}: source not enabled for publication: ${site.key}`);
    keys.add(site.key);
    await localFile(site.api);
  }
  return config.sites.length;
};

const catalog = await readJson('catalog.json');
assert(catalog.schemaVersion === 1, 'catalog: unsupported schema');
assert(Array.isArray(catalog.categories) && Array.isArray(catalog.sources), 'catalog: invalid shape');
for (const source of catalog.sources) await localFile(source.plugin);
const verified = catalog.sources.filter(source => source.health === 'verified');
const publishedKeys = new Set(catalog.sources
  .filter(source => source.health === 'verified' || (source.health === 'partial' && source.publishPartial === true))
  .map(source => source.id));

const defaultCount = await validateConfig('dxplay.json', publishedKeys);
for (const category of catalog.categories) await validateConfig(`configs/${category.id}.json`, publishedKeys);
const compatibility = await readJson('compatibility.json');
assert(compatibility.schemaVersion === 1, 'compatibility: unsupported schema');
assert(compatibility.summary?.verified === verified.length, 'compatibility: verified source count mismatch');

process.stdout.write(`Release check passed: ${catalog.sources.length} catalog sources, ${defaultCount} default sources.\n`);

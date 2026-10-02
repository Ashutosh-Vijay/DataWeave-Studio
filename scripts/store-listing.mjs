// Fills the Microsoft Store draft submission's en-us listing from the repo, so
// the Store page changes with each release instead of by hand in Partner Center.
//
//   node scripts/store-listing.mjs <submission-in.json> <submission-out.json> <version>
//
// The input is what `msstore submission get` printed. Description, short
// description, features and search terms come from docs/store-listing.json; the
// "What's new" text is that version's entry in src/releases.json (desktop items
// only), the same notes the app's What's New dialog shows.
import { readFileSync, writeFileSync } from 'node:fs';

const [inPath, outPath, rawVersion] = process.argv.slice(2);
if (!inPath || !outPath || !rawVersion) {
  console.error('usage: node scripts/store-listing.mjs <submission-in.json> <submission-out.json> <version>');
  process.exit(2);
}
const version = rawVersion.replace(/^v/, '');
const root = new URL('..', import.meta.url);
const listing = JSON.parse(readFileSync(new URL('docs/store-listing.json', root), 'utf8'));
const releases = JSON.parse(readFileSync(new URL('src/releases.json', root), 'utf8'));

// The CLI can print more than the JSON; keep the outermost object.
const text = readFileSync(inPath, 'utf8');
const submission = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));

// The API's casing isn't documented the same way everywhere, so match keys
// case-insensitively and write back under whatever casing is already there.
const keyOf = (obj, name) => Object.keys(obj).find((k) => k.toLowerCase() === name.toLowerCase());
const child = (obj, name) => {
  const k = keyOf(obj, name);
  if (!k) throw new Error(`the submission has no "${name}"`);
  return obj[k];
};
const set = (obj, name, value) => {
  // A field that isn't there yet follows the casing of the ones that are.
  const camel = Object.keys(obj).some((k) => /^[a-z]/.test(k));
  obj[keyOf(obj, name) ?? (camel ? name[0].toLowerCase() + name.slice(1) : name)] = value;
};

const base = child(child(child(submission, 'Listings'), 'en-us'), 'BaseListing');

// The Store's limits, checked here so a release fails with a clear message
// rather than a rejected submission.
const problems = [];
if (listing.description.length > 10000) problems.push(`description is ${listing.description.length} characters (max 10000)`);
if (listing.shortDescription.length > 1000) problems.push(`short description is ${listing.shortDescription.length} characters (max 1000)`);
if (listing.features.length > 20) problems.push(`${listing.features.length} features (max 20)`);
for (const f of listing.features) if (f.length > 200) problems.push(`feature over 200 characters: "${f.slice(0, 40)}…"`);
if (listing.keywords.length > 7) problems.push(`${listing.keywords.length} search terms (max 7)`);
for (const k of listing.keywords) if (k.length > 30) problems.push(`search term over 30 characters: "${k}"`);
if (problems.length) {
  console.error('docs/store-listing.json breaks the Store limits:\n  ' + problems.join('\n  '));
  process.exit(1);
}

set(base, 'Description', listing.description);
set(base, 'ShortDescription', listing.shortDescription);
set(base, 'Features', listing.features);
set(base, 'Keywords', listing.keywords);

// "What's new", plain text, at most 1500 characters. Items that don't fit are
// dropped from the end with a pointer to the app, which has all of them.
const release = releases.find((r) => r.version === version);
if (release) {
  const items = release.highlights.filter((h) => h.only !== 'vscode').map((h) => `• ${h.title}. ${h.desc}`);
  const more = 'More in What’s new, inside the app.';
  let notes = [release.headline, '', ...items].join('\n');
  while (notes.length > 1500 && items.length > 1) {
    items.pop();
    notes = [release.headline, '', ...items, '', more].join('\n');
  }
  set(base, 'ReleaseNotes', notes.slice(0, 1500));
  console.log(`What's new: ${release.headline} (${items.length} item(s), ${notes.length} characters)`);
} else {
  console.log(`::warning::src/releases.json has no entry for ${version}; the Store's "What's new" is left as it was.`);
}

writeFileSync(outPath, JSON.stringify(submission));
console.log(`Listing: description ${listing.description.length} chars, ${listing.features.length} features, ${listing.keywords.length} search terms`);

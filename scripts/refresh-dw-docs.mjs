// One command to re-pull the DataWeave reference from mulesoft/docs-dataweave
// and regenerate everything derived from it:
//
//   npm run docs:refresh
//
//   src/dataweaveDocs.ts     — function reference   (extract-dw-docs.mjs)
//   src/dataweaveFormats.ts  — format read/write options (extract-dw-formats.mjs)
//   src/cookbookOfficialRecipes.ts — official cookbook (extract-dw-cookbook.mjs)
//
// The clone is pinned to the branch matching our bundled engine, so the editor
// can never document a function the runtime doesn't have. Bump DOCS_BRANCH in
// lockstep with the engine jar, not before.
import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';

const DOCS_BRANCH = 'v2.12'; // must match the bundled DW runtime (see dw-server/pom.xml)
const DIR = '.dwdocs-src';
const run = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', ...opts });

// The clone is --single-branch, so its refspec only knows the branch it was
// made with. After bumping DOCS_BRANCH, fetching the new one fails with
// "couldn't find remote ref" (git exit 128) -- so re-clone instead of fetching
// when the existing checkout is on a different branch.
if (existsSync(DIR)) {
  let onBranch = '';
  try {
    onBranch = execSync(`git -C ${DIR} rev-parse --abbrev-ref HEAD`, { encoding: 'utf8' }).trim();
  } catch { /* not a git dir -- fall through to the re-clone below */ }
  if (onBranch !== DOCS_BRANCH) {
    console.log(`==> ${DIR} is on ${onBranch || 'an unknown ref'}, want ${DOCS_BRANCH} -- re-cloning`);
    rmSync(DIR, { recursive: true, force: true });
  }
}

if (existsSync(DIR)) {
  console.log(`==> Updating ${DIR} (${DOCS_BRANCH})`);
  run(`git -C ${DIR} fetch --depth 1 origin ${DOCS_BRANCH}`);
  run(`git -C ${DIR} reset --hard origin/${DOCS_BRANCH}`);
} else {
  console.log(`==> Cloning docs-dataweave@${DOCS_BRANCH}`);
  run(`git clone --depth 1 --branch ${DOCS_BRANCH} --single-branch https://github.com/mulesoft/docs-dataweave.git ${DIR}`);
}

console.log('\n==> Function reference');
run(`node scripts/extract-dw-docs.mjs ${DIR}/modules/ROOT/pages`);
console.log('\n==> Format options');
run('node scripts/extract-dw-formats.mjs');
console.log('\nDone. Review the diff in src/dataweaveDocs.ts + src/dataweaveFormats.ts.');

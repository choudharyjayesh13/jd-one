/** Publish ./out to the gh-pages branch (used until the Pages GitHub Action is enabled). */
import { $ } from "bun";
const msg = `Deploy ${new Date().toISOString()}`;
await $`git worktree remove --force .gh-pages`.quiet().nothrow();
await $`git fetch origin gh-pages`.quiet().nothrow();
const exists = (await $`git ls-remote --heads origin gh-pages`.text()).trim().length > 0;
if (exists) await $`git worktree add .gh-pages origin/gh-pages`;
else await $`git worktree add --detach .gh-pages`;
await $`sh -c "cd .gh-pages && (git checkout -B gh-pages) && git rm -rq . 2>/dev/null; true"`;
await $`cp -R out/. .gh-pages/`;
await $`touch .gh-pages/.nojekyll`;
await $`sh -c "cd .gh-pages && git add -A && (git -c user.name='JD One deploy' -c user.email='noreply@anthropic.com' commit -qm '${msg}' || true) && git push -f origin gh-pages"`;
await $`git worktree remove --force .gh-pages`;
console.log("Published to gh-pages:", msg);

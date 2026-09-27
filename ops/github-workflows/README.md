These two GitHub Actions workflows live here temporarily because the GitHub token on the Mac lacked the `workflow` scope (needed to push files under `.github/workflows/`).
To activate them: `gh auth refresh -h github.com -s workflow`, then `git mv ops/github-workflows/*.yml .github/workflows/` and push.
- pages.yml — builds the static site and deploys to GitHub Pages on every push to main (until then the site is published from the `gh-pages` branch by `bun run deploy:pages`).
- import-meta-leads.yml — daily 08:00 IST Meta leads import (until then use ops/launchd/com.jyc.jdone-meta-import.plist on the Mac).

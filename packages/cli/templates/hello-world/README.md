# {{PROJECT_TITLE}}

This is the smallest complete Super Visual project: one semantic table, one
measure, one broker dataset, one page, and one accessible React chart.

Install dependencies, then run these commands from this project directory:

```bash
npm install
npm run check
npm run compile
npm run package
npm run verify
```

Edit the contracts under `contracts/` to point at your governed data. Application
source receives data only through `ReportApplicationProps`.

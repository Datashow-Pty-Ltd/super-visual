# Super Visual Hello World

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

For a real Fabric sandbox, follow [deployment/CERTIFICATION.md](deployment/CERTIFICATION.md).
The source profile overrides only the generated bundle and keeps tenant-specific
endpoint values out of the checked-in contract.

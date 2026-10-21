# Solution bundle

`supervisual build` creates one deterministic directory containing everything
needed to inspect, package, and deploy an analytical application:

```text
dist/
├── Base.SemanticModel/          # compiler semantic source
├── SemanticAdapter.SemanticModel/ # internally managed report binding
├── Visual/                      # generated Power BI visual source
├── Report.Report/               # one-page PBIR host wrapper
└── supervisual.manifest.json    # inputs, provenance, and SHA-256 inventory
```

The visual source combines the fixed broker runtime with only the validated
application source and generated manifests. The report wrapper binds all eight
broker roles and fills a 1920×1080 page. Packaging the visual adds the `.pbiviz`
resource to the wrapper; the build directory is otherwise inspectable source,
not an opaque archive.

`SemanticAdapter.SemanticModel` is an internal artifact name, not part of the
user workflow. Users select one Power BI semantic model; the CLI owns this
generated artifact and records its identity privately.

The manifest hashes every output except itself so CI and deployment agents can
detect drift between compliance, review, and deployment.

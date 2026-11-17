# Unified Updater Validation

Target: Runtime Guard 0.2.7, updater protocol 1.

- Archive SHA-256: `7799119153e900914e1f8893f3311e02f920d48165ec4b6d15caa32df4f864ad`
- Standalone helper SHA-256: `4d10a3133f3f83b36eb0316de7713a74ae1e1d1dbcf4609cae210f60007a7f74`
- Host: DSH 0.2.1-rc.2, Windows, bundled pnpm 11.28.5.
- Sources: 0.2.0, 0.2.1, 0.2.2, 0.2.3, 0.2.4, 0.2.5, 0.2.6, original 0.2.7, 0.2.7-beta.1.
- Each source passed startup/restart-required and live HMR installation: 18/18.
- Each path first reproduced `ERR_PNPM_UNEXPECTED_STORE` using real pnpm.
- Source plugins were activated through the real DSH loader. The repaired
  updater then used the real native plugin manager and pnpm. HMR paths activated
  the target plugin and restored the existing counters and history events.
- User settings, custom profile patches, and history were preserved. Helper
  enable/re-enable/disable and default empty patch restoration passed.
- Release HTTP metadata/download responses were deterministic fixtures. This
  matrix does not claim to test GitHub availability or every DSH host version.
- Final regression: 397 passed, 1 skipped; TypeScript check passed.

The full machine-readable report is published as `upgrade-results.json` with
the repaired 0.2.7 archive. Future releases must pass the same upgrade gate with
the exact archive and helper hashes being published.

The original 0.2.7 tag remains unchanged. The repaired download is a documented
archive revision, with original release assets retained under archival names.
Already-installed legacy code needs the standalone helper once; installing a
new release cannot remotely rewrite an older installed updater.

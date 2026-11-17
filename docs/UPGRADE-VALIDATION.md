# Unified Updater Validation

Target: Runtime Guard 0.2.7, updater protocol 1.

- Archive SHA-256: `937f0595efe250da5402b0a7767f344d19a1a4851ae36d5bcc9c219b3e4e9b48`
- Standalone helper SHA-256: `0100d39675c6dadab05ac054c4516be8851d96e8fdd6458657edd66c3cfd5b48`
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
- The legacy helper's actual plugin entry was separately exercised in real
  Cordis, including its Agent service injection and busy-agent queue.
- Final regression: 398 passed, 1 skipped; TypeScript check passed.

The full machine-readable report is published as `upgrade-results.json` with
the repaired 0.2.7 archive. Future releases must pass the same upgrade gate with
the exact archive and helper hashes being published.

The original 0.2.7 tag remains unchanged. The repaired download is a documented
archive revision, with original release assets retained under archival names.
Already-installed legacy code needs the standalone helper once; installing a
new release cannot remotely rewrite an older installed updater.

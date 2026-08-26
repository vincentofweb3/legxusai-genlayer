# Deployment Records

This directory contains sanitized public GenLayer deployment evidence and null-field templates for environments that have not been verified. `studio.json` records the independently verified Studio deployment tied to reviewed source commit `33286c8f57f2bc0b517ccf1a1ec457f040e13ee1`. The template files are not deployment proof: their `contractAddress` and `deploymentTxHash` fields remain `null`.

The public network and toolchain fields mirror `config/genlayer_config.json`:

- Studio development: `studionet`, chain `61999`.
- Bradbury release validation: `testnet-bradbury`, chain `4221`.
- GenLayer CLI: `0.39.2`.
- `genlayer-js`: `1.1.8`.
- GenVM runner: `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6`.

`studio.json` contains only public facts verified from the finalized deployment transaction, deployed code, and schema. A future deployment record must likewise be copied from the appropriate template and populated only with canonical public evidence. Do not add a private key, mnemonic, keystore, account export, credential, or local secret path.

Before deploying or changing the selected CLI network, use the repository-pinned CLI and inspect its current help:

```bash
npm ls genlayer genlayer-js --depth=0
npm run genlayer -- --help
npm run genlayer -- network --help
```

The verified CLI selection forms are `npm run genlayer -- network set studionet` for development and `npm run genlayer -- network set testnet-bradbury` for release validation. Selection changes CLI configuration and must be an explicit operator action.

The Studio deployment is verified. Separate receipt-backed evidence now verifies the `DSP-0001` demonstration from filing through respondent acceptance, GenVM evaluation, receipt validation, and canonical final state:

- Filing: `0x0d3c289df8bd3c2f141e9ff2e26858a5a0c766759b767b50f12d7d9574d1ed20`.
- Respondent acceptance: `0xb81751f7e393bdd2267ce6b2fc64d60263a23f481ef991c7db2154b4e55aa15f`.
- Evaluation: `0x0935963f09eeb8f83816a54e7526915d2345311e8535914473a8b09ad23e0dea`, agreed outcome `UNDETERMINED`.

The hashes are public verification evidence, not credentials. This evidence is scoped to Studio `studionet` / chain `61999`; no Bradbury deployment or lifecycle evidence has been verified. Protocol appeals, escrow, settlement, fees, bonds, payouts, transfers, and a complete network transaction index remain outside this release. See [../docs/GENLAYER_VALIDATION.md](../docs/GENLAYER_VALIDATION.md) for the bounded verification record and [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) for the trust boundaries.

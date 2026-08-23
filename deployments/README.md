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

The Studio deployment is verified, but deployment alone is not proof of the complete dispute lifecycle. Filing, respondent acceptance, GenVM evaluation, and final canonical-state evidence are reviewed as separate gates. No Bradbury deployment has been verified.

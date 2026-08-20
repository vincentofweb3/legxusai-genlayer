# Deployment Records

This directory contains sanitized templates for public GenLayer deployment evidence. The templates are not proof that a deployment exists: `contractAddress` and `deploymentTxHash` remain `null` until independently verified. `genvmRunner` records the reviewed project toolchain pin and does not assert that a contract deployment exists.

The public network and toolchain fields mirror `config/genlayer_config.json`:

- Studio development: `studionet`, chain `61999`.
- Bradbury release validation: `testnet-bradbury`, chain `4221`.
- GenLayer CLI: `0.39.2`.
- `genlayer-js`: `1.1.8`.
- GenVM runner: `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6`.

After a verified deployment, copy the appropriate template to a new reviewed manifest and fill only public evidence obtained from the canonical deployment transaction and receipt. Do not add a private key, mnemonic, keystore, account export, credential, or local secret path.

Before deploying or changing the selected CLI network, use the repository-pinned CLI and inspect its current help:

```bash
npm ls genlayer genlayer-js --depth=0
npm run genlayer -- --help
npm run genlayer -- network --help
```

The verified CLI selection forms are `npm run genlayer -- network set studionet` for development and `npm run genlayer -- network set testnet-bradbury` for release validation. Selection changes CLI configuration and must be an explicit operator action.

No deployment command or address is recorded here because this remediation phase has not verified a deployment.

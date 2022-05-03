# Solana Donation App

## Setup

### Anchor build & test

```
% solana-keygen new (opitonal)
% yarn install
% anchor build
% solana address -k target/deploy/crypton_solana_donation-keypair.json 
%% add the produced address to declare_id!() in ./programs/CryptonSolanaDonation/src/lib.rs
% anchor build
% anchor test --provider.cluster=localnet OR anchor deploy
```

### Install React packages

```
% cd app
%% replace the codes in ./app/src/idl.json with the generated codes in ./target/idl/crypton_solana_donation.json
% yarn install
```

## Run DApps

```
% yarn start
```

Go to http://localhost:3000
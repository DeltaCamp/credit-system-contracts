# Credit System Contracts

The Credit System contracts allows users to transfer tokens rapidly, sacrificing some trust in place of an on-chain credit score.

# Setup

Clone the repo and then install deps:

```
$ yarn
```

Copy over .envrc and allow direnv:

```
$ cp .envrc.example .envrc
$ direnv allow
```

# Deploying Locally

If you changed the mnemonic, you should update the ADMIN_ADDRESS variable in `.envrc` with another address (I use the second address listed when `ganache-cli` starts).

Start `ganache-cli`:

```
$ yarn start
```

Now start a new zos session:

```
$ yarn session
```

Push out the local contracts:

```
$ yarn push
```

Migrate the contracts and bootstrap the data:

```
$ yarn migrate
```

# Deploying to Rinkeby

```
yarn session-rinkeby
zos push
yarn migrate-rinkeby
```

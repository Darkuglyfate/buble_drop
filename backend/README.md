<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## BubbleDrop local services

BubbleDrop backend expects local PostgreSQL and Redis on the default ports already present in `backend/.env.example`:

```bash
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=bubbledrop

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
```

The repo now includes a minimal local bootstrap at `../docker-compose.local.yml` with:

- PostgreSQL `16` on `localhost:5432`
- Redis `7` on `localhost:6379`

If you want to keep the default local setup, you usually do not need to change backend env values at all.

### Local BubbleDrop bootstrap

From `backend/`:

```bash
# start postgres + redis
$ npm run dev:services:up

# run schema migrations
$ npm run db:migration:run

# seed MVP reference data
$ npm run db:seed:reference-data

# start backend
$ npm run start:dev
```

Or run the one-shot DB bootstrap:

```bash
$ npm run db:bootstrap:local
```

Useful helpers:

```bash
# stream local postgres + redis logs
$ npm run dev:services:logs

# stop local services
$ npm run dev:services:down
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode (runs DB migrations first, then API)
$ npm run start:prod

# production without migrations (emergency only)
$ npm run start:prod:skip-migrate
```

### Production deploy (Render, Railway, VPS)

1. Set `NODE_ENV=production`, `FRONTEND_ORIGIN`, `DB_*` (or compatible Postgres URL via env your host provides), `AUTH_SESSION_SECRET`, etc.
2. Build: `npm ci && npm run build`
3. Start: **`npm run start:prod`** — on each deploy this **applies pending TypeORM migrations** then starts Nest. No manual `db:migration:run` on the server unless you prefer it.
4. After **first** production DB setup, run reference seed once if your checklist requires it: `npm run db:seed:reference-data` (needs DB env; may use Render shell).
5. To disable auto-migrate: `RUN_MIGRATIONS_ON_START=0 npm run start:prod` (not recommended).

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

### Render

For low-memory Render instances, do not start the backend with the Nest CLI runtime.
Use the compiled production entry instead:

```bash
# build command
npm install && npm run build

# start command
npm run start
```

`npm run start` now runs `node dist/main`, which is the same lightweight production path as `npm run start:prod`.

Required Render runtime env values:

```bash
NODE_ENV=production
PORT=<provided by Render>
FRONTEND_ORIGIN=https://your-frontend.example.com
AUTH_SESSION_SECRET=<long-random-secret>
DB_HOST=...
DB_PORT=5432
DB_USER=...
DB_PASSWORD=...
DB_NAME=...
REDIS_HOST=...
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
BASE_RPC_URL=https://your-stable-base-mainnet-rpc
```

If live reward-wallet payout is intended for launch, also set:

```bash
REWARD_WALLET_ADDRESS=0x...
REWARD_WALLET_PRIVATE_KEY=0x...
```

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).

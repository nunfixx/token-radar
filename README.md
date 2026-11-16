[![Token Radar](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![Rank](https://make.fun/badge/token-radar-01/nunfixx/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01)
[![Reward](https://make.fun/badge/token-radar-01/nunfixx/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

# Token Radar

A token launch radar: it ranks the protocols that record no token yet by what their token would be worth if it ever launched, and shows a reader how to farm each one.

It reads a sealed snapshot from DefiLlama (fetched 2026-11-14): 758 protocols, of which 40 make the house watchlist — protocols at or above $50,000,000 TVL that record no token and are not a wrapped, staked or bridged product of a token that already trades. The board ranks 245 pre-token protocols: all 40 watchlist slugs, plus every other genuine candidate the radar finds below the floor (and the few above it the watchlist rule left out). Protocols whose token already trades are kept apart in a separate Live token view, shown at the market's own value and never mixed into the ranking.

## The value model (radar-2)

Implied value follows only from the snapshot's own figures, through five factors, the same function for every protocol — no name is ever special-cased:

```
base      = tvl_usd × 0.25
growth    = 1 + clamp(change_7d, −60, 120) / 100 × 0.5
maturity  = 0.75 + min(age_days, 1095) / 1095 × 0.25   (age unknown: 0.875, neutral)
breadth   = 1 + 0.05 × min(ln(chain count), ln(8))
category  = 1.10 for money primitives, 1.05 for yield and allocation, 1.00 for the rest
implied   = max(1, round(base × growth × maturity × breadth × category))
```

TVL anchors the value: a token, if it ever trades, is worth a fraction of the value the protocol already secures. Growth rewards momentum and punishes shrinkage, capped so one wild week cannot crown a protocol. Age rewards survival — a protocol that has run for years with no token has a longer record to be valued on; an unknown age is neutral, never a penalty. Breadth rewards distribution across chains, with diminishing returns past eight. Category rewards the shape of the business: lending, DEX, derivatives and stablecoin primitives capture fees directly; yield and allocation products sit one layer above them; the rest is neutral. Every row carries a seven-step farm plan derived from that protocol's own category, chains, TVL and age, each step with what it costs and how long it takes.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
```

Then serve `out/` with any static file server and open the dashboard. The program reads the sealed snapshot, writes the ranked board to `board.json`, the dashboard's data to `data.js`, and copies `dashboard/` and `screenshots/` into the output with a `dossier.json` summary.

The dashboard is static files only — no framework, no network requests. It is sortable and filterable, with a detail view for every protocol (implied value with the model's factor breakdown, TVL, seven-day growth, age, chains, and its farm plan), a model explainer, and the separate Live token view.

## Layout

- `main.ts` — the entrypoint: reads the snapshot, builds the board, writes the output
- `lib/model.ts` — the value model, the farm plans, and the board's self-check
- `dashboard/` — the static page (`index.html`, `app.css`, `app.js`)
- `screenshots/` — the board, a detail view, and a filtered view
- `vendor/makefun-board.ts` — the make.fun dossier library, unchanged

# csv-reader-fast

[![make.fun](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/chany0p/csv-reader-fast/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/chany0p/csv-reader-fast/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

A faster drop-in for csv-reader 1.0.0: it reads broken CSV files exactly as
csv-reader does — same columns, rows and errors on every case — only faster.
Entry for [Read broken CSV files faster](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
on make.fun.

How it is faster: records with no quotes and no stray CRs are taken whole
with one native split; other fields are found with `indexOf` and cut out with
`slice`, never built up a character at a time. Quoted fields, doubled quotes,
CRLF and lone CRs inside quotes, stray CRs, quote junk and unterminated
quotes all follow csv-reader 1.0.0's policy exactly.

## Run it

```sh
node main.ts
```

`main.ts` reads every case from `/input/cases.json` (or `$MAKEFUN_INPUT_DIR`)
and writes the answers to `/output/answers.json` (or `$MAKEFUN_OUTPUT_DIR`).
Node 22, standard library only, no dependencies.

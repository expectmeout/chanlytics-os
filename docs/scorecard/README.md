# The scorecard

Each scoring of the codebase against the forty-category checklist, as data: one JSON file a day, named by its day,
the data behind the page the reviewers hand over. A scoring marks every bullet of every category `holds`, `partly`,
`absent` or `n/a` with a sentence of evidence citing the files it read, re-checks every known defect by the files it
names, and records the fifteen moves and the largest functions, all against one commit, named in `meta.snapshot`.

`docs/takeover.md` is the short form a person reads; this is the record a tool reads.
`tooling/scripts/tests/docs/scorecard.test.mjs` holds each file's shape, its lede's counts, and that most of what it
cites is in the tree.

## Before the next scoring

Most of a scoring's marks are about files nobody has touched since. Ask which:

```bash
node tooling/scripts/scorecard.mjs           # the latest scoring against HEAD
node tooling/scripts/scorecard.mjs --all     # every row, sorted
node tooling/scripts/scorecard.mjs --json    # for a tool
```

A mark whose cited files are byte-identical is **carried forward**. A mark that cites a file that changed is the one
**to re-judge**. A mark that cites nothing goes to a reviewer, with a request for a citation next time; a mark that
cites only files the tree does not have (a reviewer's own probes, or where a defect was found before its file moved)
is **external**. The reviewers read the second list, and the third.

## Adding a scoring

Save the page's `DATA` object as `docs/scorecard/<YYYY-MM-DD>.json` and run the suite: the test holds the shape, the
cited paths, and that the lede's counts are the bullets'.

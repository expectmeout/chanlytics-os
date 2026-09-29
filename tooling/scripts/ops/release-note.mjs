#!/usr/bin/env node
/**
 * A tag per deploy and the note of what it carried.
 *
 * A merge to main deploys both apps (docs/runbook.md, Deploy), and until this nothing marked which merge a deployment
 * was: no tag, no release, no note (the scorecard's CI/CD, Versioning and Release Process). The release workflow
 * (.github/workflows/release.yml) tags every push to main `vYYYY.MM.DD-<sha>`, the day in UTC and the commit's first
 * nine characters, and publishes a release whose note is the pull requests merged since the last tag: each one's title
 * as GitHub holds it when the workflow can read it, else the subject that landed, less its " (#1234)".
 *
 *   node tooling/scripts/ops/release-note.mjs --tag <sha>        # the tag for that commit
 *   node tooling/scripts/ops/release-note.mjs --to <sha>         # the note, since the tag before it
 *
 * Reads git; reads GitHub's pull requests when GH_TOKEN (or GITHUB_TOKEN) and GITHUB_REPOSITORY are set. Writes
 * nothing: the workflow creates the release from what it prints.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

/** The tag a commit deploys as: the UTC day it was committed, and its first nine characters. */
export function tagFor(committedAt, sha) {
  const day = new Date(committedAt).toISOString().slice(0, 10).replace(/-/g, ".");
  return `v${day}-${sha.slice(0, 9)}`;
}

/** A subject that landed, split into its title and the pull request GitHub numbered it with, if any. */
export function parseSubject(subject) {
  const m = /^(.*) \(#(\d+)\)$/.exec(subject.trimEnd());
  return m ? { title: m[1], pr: Number(m[2]) } : { title: subject.trimEnd(), pr: null };
}

/**
 * The note's markdown: what landed between the last tag and this one, oldest first, each pull request by its title
 * (from `titles`, the numbers GitHub answered for) and a commit without a number by its subject and sha.
 */
export function renderNote({ tag, since, commits, titles = new Map(), repoUrl = "" }) {
  const lines = [`What deployed as ${tag}${since ? `, since ${since}` : ""}:`, ""];
  for (const c of [...commits].reverse()) {
    const { title, pr } = parseSubject(c.subject);
    if (pr === null) lines.push(`- ${title} (${c.sha.slice(0, 9)}, no pull request named)`);
    else lines.push(`- ${titles.get(pr) ?? title} (${repoUrl ? `[#${pr}](${repoUrl}/pull/${pr})` : `#${pr}`})`);
  }
  if (!commits.length) lines.push("- Nothing since the last tag.");
  return `${lines.join("\n")}\n`;
}

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

/** The newest release tag reachable from before `sha`, or null for the first. */
function lastTagBefore(sha) {
  try {
    // No tag yet is the first release, not an error: git's "No names found" stays out of the log.
    return execFileSync("git", ["describe", "--tags", "--abbrev=0", "--match", "v*", `${sha}^`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/** Main's commits after `since` up to `sha`, first parent only, newest first. */
function commitsSince(since, sha) {
  const out = git("log", "--first-parent", "--format=%H%x09%s", ...(since ? [`${since}..${sha}`] : ["-1", sha]));
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, ...subject] = line.split("\t");
      return { sha: hash, subject: subject.join("\t") };
    });
}

/** Each pull request's title as GitHub holds it, for the numbers asked; none when GitHub cannot be read. */
async function prTitles(numbers) {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  const titles = new Map();
  if (!token || !repo) return titles;
  for (const n of numbers) {
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/pulls/${n}`, {
        headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" },
      });
      if (res.ok) titles.set(n, (await res.json()).title);
    } catch {
      /* the subject stands in */
    }
  }
  return titles;
}

async function main() {
  const args = process.argv.slice(2);
  const tagAt = args.indexOf("--tag");
  if (tagAt >= 0) {
    const sha = git("rev-parse", args[tagAt + 1] ?? "HEAD");
    console.log(tagFor(git("show", "-s", "--format=%cI", sha), sha));
    return;
  }
  const toAt = args.indexOf("--to");
  const sha = git("rev-parse", toAt >= 0 ? args[toAt + 1] : "HEAD");
  const since = lastTagBefore(sha);
  const commits = commitsSince(since, sha);
  const numbers = commits.map((c) => parseSubject(c.subject).pr).filter((n) => n !== null);
  const repoUrl =
    process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}`
      : "";
  process.stdout.write(
    renderNote({
      tag: tagFor(git("show", "-s", "--format=%cI", sha), sha),
      since,
      commits,
      titles: await prTitles(numbers),
      repoUrl,
    }),
  );
}

// Run as a script, not when a test imports it.
const real = (p) => fs.realpathSync.native(p);
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) await main();

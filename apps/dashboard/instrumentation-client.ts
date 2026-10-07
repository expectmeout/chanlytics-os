/**
 * Runs before any of the app's frontend code (Next's instrumentation-client
 * convention). One job: zod must know it may not compile parsers from strings
 * before the first schema in any client module is built; contracts sets the
 * same thing first in its own graph (packages/contracts/src/zod-config.ts
 * says why the order matters). Every zod instance the browser ever loads is
 * covered by one of the two. Said through zod's core, whose configuration the
 * classic API and zod/mini share: importing the classic API here put all of it
 * on every page's first load, 89 KB gzipped, for one line of configuration.
 */
import { config } from "zod/v4/core";

config({ jitless: true });

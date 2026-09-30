// Imported first by a test that asserts the day a viewer in UTC reads. Contracts builds its date formatters when it loads,
// and a formatter keeps the zone it was built in, so the zone is set before contracts is imported: a module's imports
// run in the order written. The words themselves are said in the viewer's zone (a browser's), which a machine twelve
// hours east would make another day; these tests pin the viewer they describe. Not a *.test.mjs, so the suite never globs it.
process.env.TZ = "UTC";

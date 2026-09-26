// The app's own lint: Expo's flat config, plus the repository's layer rule (the PRD, M10): the shell may import
// @chanlytics/contracts and nothing else from the tree.
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", ".expo/*", "expo-env.d.ts", "ios/*", "android/*"],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@chanlytics/*", "!@chanlytics/contracts"],
              message: "The shell imports contracts and nothing else from the tree.",
            },
            {
              group: ["../../../*", "../../../../*"],
              message: "The shell reaches the tree through @chanlytics/contracts only.",
            },
          ],
        },
      ],
    },
  },
]);

/**
 * Remotion config for Direct Recruit social/video assets.
 * Docs: https://www.remotion.dev/docs/config
 */

import { Config } from "@remotion/cli/config";

// Renders at full quality; 1080×1920 (story/reel) compositions are the default.
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setChromiumOpenGlRenderer("angle");

// Entry point for the composition registry.
Config.setEntryPoint("./src/remotion/index.ts");

// Public dir (staticFile assets) lives with the project, not at the repo root.
// Set explicitly so `public/` resolves the same whether the CLI runs from the
// repo root (npm scripts) or from src/remotion/.
Config.setPublicDir("./src/remotion/public");

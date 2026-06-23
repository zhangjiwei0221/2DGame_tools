import { spawnSync } from "node:child_process";

run(["scripts/generate_mock_assets.py", "video", "--out", "tmp/demo_action.mp4", "--frames", "48"]);
run([
  "scripts/process_video.py",
  "--input",
  "tmp/demo_action.mp4",
  "--out-dir",
  "exports/demo_hero/run",
  "--character",
  "demo_hero",
  "--action",
  "run",
  "--frames",
  "12"
]);

function run(args) {
  const result = spawnSync("python", args, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

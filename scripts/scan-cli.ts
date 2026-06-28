/* Quick local test: `npm run scan -- https://example.com` */
import { scanUrl } from "../lib/scanner";

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error("Usage: npm run scan -- <url>");
    process.exit(1);
  }
  const report = await scanUrl(url);
  console.log(`\nScore: ${report.score}/100  (${report.passed} checks passed)\n`);
  for (const i of report.issues) {
    console.log(`[${i.severity.toUpperCase()}] ${i.title}  — WCAG ${i.wcag}`);
  }
  if (report.issues.length === 0) console.log("No static issues found.");
  console.log("");
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});

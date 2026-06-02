const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const PROJECT = 'C:\\Users\\Sory kaba\\OneDrive\\RESUMSIFY\\Personal_Projects\\Dev_Pojects\\resumsify';
const SKILL = 'C:\\Users\\Sory kaba\\.copilot\\skills\\understand';
const tmp = path.join(PROJECT, '.understand-anything', 'tmp');

let ok = 0, fail = 0;

for (let i = 2; i <= 34; i++) {
  const inp = path.join(tmp, `ua-file-analyzer-input-${i}.json`);
  const out = path.join(tmp, `ua-file-extract-results-${i}.json`);

  if (!fs.existsSync(inp)) {
    console.log(`SKIP batch ${i} (no input)`);
    continue;
  }

  try {
    execSync(`node "${SKILL}\\extract-structure.mjs" "${inp}" "${out}"`, {
      stdio: 'pipe',
      timeout: 90000
    });
    ok++;
    process.stdout.write(`OK ${i} `);
  } catch (e) {
    console.error(`\nFAIL batch ${i}: ${e.message.slice(0, 150)}`);
    fail++;
  }
}

console.log(`\nDone: ok=${ok} fail=${fail}`);

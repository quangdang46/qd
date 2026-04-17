/**
 * QD Test Runner
 * Runs all test suites
 */

const { execSync } = require('child_process');
const path = require('path');

const tests = [
  { name: 'Schema Validation', file: 'test-schema-validation.ts' },
  { name: 'Platform Filter', file: 'test-platform-filter.ts' },
  { name: 'Remove', file: 'test-uninstall.ts' }
];

let allPassed = true;

for (const test of tests) {
  console.log(`\n=== Running ${test.name} Tests ===\n`);
  try {
    execSync(`npx ts-node --esm ${path.join(__dirname, test.file)}`, { stdio: 'inherit' });
    console.log(`\n✓ ${test.name} passed`);
  } catch (error) {
    console.log(`\n✗ ${test.name} failed`);
    allPassed = false;
  }
}

if (allPassed) {
  console.log('\n\n✓ All test suites passed!\n');
  process.exit(0);
} else {
  console.log('\n\n✗ Some test suites failed.\n');
  process.exit(1);
}

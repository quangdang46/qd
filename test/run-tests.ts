/**
 * QD Test Runner
 * Runs all test suites
 */

const { execSync } = require('child_process');

try {
  execSync('pnpm test', { stdio: 'inherit' });
  console.log('\n\n✓ All test suites passed!\n');
  process.exit(0);
} catch (error) {
  console.log('\n\n✗ Some test suites failed.\n');
  process.exit(1);
}

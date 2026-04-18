/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/test/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: './tsconfig.test.json',
    }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@clack)/)',
  ],
  testTimeout: 30000,
  moduleNameMapper: {
    '^(\\.\\.?/.*)\\.js$': '$1',
  },
};

module.exports = config;

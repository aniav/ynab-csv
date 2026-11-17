module.exports = {
  testEnvironment: 'jsdom',
  // Source and tests run natively on supported Node versions; no transpiling needed.
  transform: {},
  moduleFileExtensions: ['js'],
  testMatch: ['**/__tests__/**/*.js', '**/?(*.)+(spec|test).js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.min.js',
  ],
};
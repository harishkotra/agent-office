module.exports = {
  root: true,
  ignorePatterns: ['node_modules/', 'dist/', 'coverage/', 'docs/'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  rules: {
    'no-control-regex': 'off',
    'prefer-const': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-console': 'off',
  },
  overrides: [
    {
      files: ['packages/estate-server/**/*.js'],
      rules: {
        '@typescript-eslint/no-require-imports': 'off',
      },
    },
    {
      // bindSocket keeps an unused third argument. That file stays as it is.
      files: ['packages/estate-server/src/server.js'],
      rules: {
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^(_|wss$)', varsIgnorePattern: '^_' }],
      },
    },
  ],
}

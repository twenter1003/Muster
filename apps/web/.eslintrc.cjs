module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
  env: { browser: true, es2022: true },
  ignorePatterns: ['dist/**', '.eslintrc.cjs'],
};

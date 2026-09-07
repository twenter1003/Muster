module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: { project: 'tsconfig.json', tsconfigRootDir: __dirname, sourceType: 'module' },
  plugins: ['@typescript-eslint/eslint-plugin'],
  extends: ['plugin:@typescript-eslint/recommended', 'plugin:prettier/recommended'],
  root: true,
  env: { node: true, jest: true },
  ignorePatterns: ['.eslintrc.js', 'dist/**'],
  rules: {
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    // 의도적으로 안 쓰는 인자/변수는 언더스코어 접두사로 표시한다.
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  },
  overrides: [
    {
      // 통합설계서 Part 2 §8 / 지시서 원칙 4: Ingest는 다른 모듈을 직접 호출하지 않고
      // EventEmitter2 이벤트만 발행한다. 규칙을 린터로 강제한다.
      files: ['src/modules/ingest/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: [
                  'src/modules/auth/*',
                  'src/modules/project-core/*',
                  'src/modules/doc-store/*',
                  'src/modules/env-catalog/*',
                  'src/modules/agent-registry/*',
                  'src/modules/realtime/*',
                  '../auth/*',
                  '../project-core/*',
                  '../doc-store/*',
                  '../env-catalog/*',
                  '../agent-registry/*',
                  '../realtime/*',
                ],
                message:
                  'Ingest 모듈은 다른 모듈을 직접 import할 수 없습니다. EventEmitter2 이벤트를 발행하세요 (통합설계서 Part 2 §8).',
              },
            ],
          },
        ],
      },
    },
  ],
};

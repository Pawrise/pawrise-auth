import type { Config } from 'jest';

const base = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  // jose n'est publié qu'en ESM : ts-jest le convertit en CommonJS pour Jest.
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
    '^.+/node_modules/jose/.+\\.js$': ['ts-jest', { tsconfig: { allowJs: true }, isolatedModules: true }],
  },
  transformIgnorePatterns: ['/node_modules/(?!jose/)'],
  testEnvironment: 'node',
} satisfies Config;

const config: Config = {
  projects: [
    { ...base, displayName: 'unit', rootDir: 'src', testRegex: '.*\\.spec\\.ts$' },
    {
      ...base,
      displayName: 'e2e',
      rootDir: 'test',
      testRegex: '.*\\.e2e-spec\\.ts$',
      setupFiles: ['<rootDir>/setup-env.ts'],
    },
  ],
};

export default config;

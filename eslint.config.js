import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * Layer boundaries (docs/ARCHITECTURE.md → "Layer rules").
 * Each zone lists the directories a layer must NOT import from, so a violation
 * fails `npm run lint` rather than being caught in review.
 */
const layerZones = [
  {
    target: './src/routes',
    from: ['./src/models', './src/services', './src/serializers', './src/integrations'],
    message: 'routes may only import middlewares, controllers and validators.',
  },
  {
    target: './src/controllers',
    from: ['./src/models', './src/integrations', './src/routes'],
    message: 'controllers may only import services, serializers, validators and core/errors.',
  },
  {
    target: './src/services',
    from: ['./src/controllers', './src/routes', './src/serializers', './src/middlewares'],
    message:
      'services may only import models, core, integrations, helpers, constants and interfaces.',
  },
  {
    target: './src/serializers',
    from: [
      './src/models',
      './src/services',
      './src/controllers',
      './src/routes',
      './src/middlewares',
      './src/integrations',
      './src/core',
    ],
    message: 'serializers are pure: types, interfaces, helpers and constants only.',
  },
  {
    target: './src/models',
    from: [
      './src/services',
      './src/controllers',
      './src/routes',
      './src/serializers',
      './src/middlewares',
      './src/integrations',
      './src/validators',
    ],
    message: 'models may only import interfaces, constants, helpers and models/plugins|schemas.',
  },
  {
    target: './src/helpers',
    from: [
      './src/models',
      './src/services',
      './src/controllers',
      './src/routes',
      './src/serializers',
      './src/middlewares',
      './src/integrations',
      './src/core',
      './src/interfaces',
    ],
    message: 'helpers are pure: types and constants only.',
  },
  {
    target: './src/middlewares',
    from: ['./src/models', './src/controllers', './src/routes', './src/serializers'],
    message: 'middlewares handle cross-cutting concerns only; no models or resource logic.',
  },
  {
    // middlewares may reach one service (auth); everything else stays out.
    target: './src/middlewares',
    from: './src/services',
    except: ['./auth.service.ts'],
    message: 'middlewares may only use the auth service.',
  },
  {
    target: './src/core',
    from: [
      './src/models',
      './src/services',
      './src/controllers',
      './src/routes',
      './src/serializers',
      './src/middlewares',
      './src/integrations',
    ],
    message: 'core is the innermost layer and must not depend on the layers above it.',
  },
  {
    target: './src/integrations',
    from: [
      './src/models',
      './src/services',
      './src/controllers',
      './src/routes',
      './src/serializers',
      './src/middlewares',
    ],
    message: 'integrations may only import core, config, constants, helpers and interfaces.',
  },
  {
    target: './src/validators',
    from: [
      './src/models',
      './src/services',
      './src/controllers',
      './src/routes',
      './src/serializers',
      './src/middlewares',
      './src/integrations',
    ],
    message: 'validators hold Zod schemas only: types, constants and helpers.',
  },
  {
    target: './src/config',
    from: [
      './src/models',
      './src/services',
      './src/controllers',
      './src/routes',
      './src/serializers',
      './src/middlewares',
      './src/integrations',
      './src/helpers',
      './src/core',
    ],
    message: 'config is read by every layer and must depend on none of them.',
  },
  {
    target: './src/constants',
    from: [
      './src/models',
      './src/services',
      './src/controllers',
      './src/routes',
      './src/serializers',
      './src/middlewares',
      './src/integrations',
      './src/helpers',
      './src/core',
    ],
    message: 'constants are leaf modules.',
  },
  {
    target: './src/interfaces',
    from: [
      './src/models',
      './src/services',
      './src/controllers',
      './src/routes',
      './src/serializers',
      './src/middlewares',
      './src/integrations',
      './src/helpers',
      './src/core',
    ],
    message: 'interfaces are leaf modules: types and constants only.',
  },
];

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'src/types/api.generated.ts',
      '.uploads/**',
      '.private-uploads/**',
      // Claude Code hook scripts: tooling, not part of the API source.
      '.claude/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { import: importPlugin },
    settings: {
      // NodeNext means imports are written as '.js' while the file on disk is
      // '.ts'. Without this resolver the boundary rule silently matches nothing.
      'import/resolver': {
        typescript: { project: './tsconfig.json', alwaysTryTypes: true },
      },
    },
    rules: {
      // TypeScript resolves identifiers itself; no-undef only produces noise here.
      'no-undef': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'all',
          // Omitting a field by destructuring it out is deliberate, not dead code.
          ignoreRestSiblings: true,
        },
      ],
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      'no-console': 'error',
    },
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      'import/no-restricted-paths': ['error', { basePath: import.meta.dirname, zones: layerZones }],
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },
  {
    // config/env.ts is the only module allowed to read process.env.
    files: ['src/**/*.ts'],
    ignores: ['src/config/env.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message: 'Read configuration from src/config/env.ts, never process.env directly.',
        },
      ],
    },
  },
  {
    files: ['scripts/**/*.{ts,mjs}', 'tests/**/*.ts', '*.config.ts', 'eslint.config.js'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
  {
    // The flat config itself is plain JS and sits outside the TS program.
    files: ['**/*.js', '**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier
);

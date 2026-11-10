// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    { ignores: ['dist', 'docs/.vitepress/cache', 'docs/.vitepress/dist'] },
    js.configs.recommended,
    tseslint.configs.strictTypeChecked,
    {
        languageOptions: {
            globals: { ...globals.browser, ...globals.node },
            parserOptions: { projectService: true },
        },
        rules: {
            '@typescript-eslint/no-confusing-void-expression': 'off',
            '@typescript-eslint/restrict-template-expressions': [
                'error',
                { allowNumber: true },
            ],
        },
    },
    { files: ['src/react.ts'], ...reactHooks.configs.flat.recommended },
    {
        files: ['**/*.js'],
        ...tseslint.configs.disableTypeChecked,
    },
    {
        files: ['src/**/*.test.{ts,tsx}'],
        rules: {
            '@typescript-eslint/no-non-null-assertion': 'off',
            '@typescript-eslint/require-await': 'off',
        },
    },
    prettier,
);

// Flat config for ESLint v9+ that mirrors the old .eslintrc.cjs settings.
// This keeps the project's existing rules while satisfying ESLint's flat
// configuration requirement.
const base = require('./.eslintrc.cjs');

module.exports = [
	// Global settings for all files
	{
		ignores: ['dist/**', 'release/**', 'node_modules/**'],
	},
	// Apply rules to JS/TS files
	{
		files: ['**/*.{js,jsx,ts,tsx}'],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: 'module',
			globals: {
				// mirror env: { browser: true, es2022: true, node: true }
				window: true,
				document: true,
				navigator: true,
				process: true,
				globalThis: true,
			},
		},
		// reuse extends and rules from legacy config where possible
		extends: base.extends || ['eslint:recommended'],
		plugins: { 'react-refresh': require('eslint-plugin-react-refresh') },
		rules: base.rules || {},
	},
];

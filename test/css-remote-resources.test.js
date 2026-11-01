import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {validateTheme} from '../scripts/validate-theme.js';

const themesDirectory = fileURLToPath(new URL('../themes/', import.meta.url));
const currentThemes = fs.readdirSync(themesDirectory, {withFileTypes: true}).filter(entry => entry.isDirectory());

async function createTheme(t, cssFiles, previewDimensions = {width: 1600, height: 900})
{
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'opencomic-theme-test-'));

	t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
	const manifest = {
		name: 'Test theme',
		version: '1.0.0',
		author: 'Test',
		description: 'Theme fixture',
		opencomicVersion: '>=1.6.0 <2.0.0',
		main: 'theme/main.css',
		preview: 'preview.png',
	};

	fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
	await sharp({
		create: {
			...previewDimensions,
			channels: 4,
			background: '#14213d',
		},
	}).png().toFile(path.join(directory, 'preview.png'));

	for(const [relativePath, contents] of Object.entries(cssFiles))
	{
		const file = path.join(directory, relativePath);
		fs.mkdirSync(path.dirname(file), {recursive: true});
		fs.writeFileSync(file, contents);
	}

	return directory;
}

test('accepts a theme with local CSS resources and a 16:9 preview', async t => {
	const directory = await createTheme(t, {
		'theme/main.css': '/* url("https://example.com/ignored.png") */\nbody { background: url("./background.png"); }',
	});

	assert.deepEqual(await validateTheme(directory), []);
});

test('rejects remote resources in every CSS file in the theme', async t => {
	const directory = await createTheme(t, {
		'theme/main.css': '@import "./colors.css";',
		'theme/nested/colors.css': [
			'@import "https://example.com/colors.css";',
			'body { background: url("https://example.com/image.png"); }',
			'body { background-image: image-set("https://example.com/retina.png" 2x); }',
			'body { background-image: url("//cdn.example.com/background.png"); }',
		].join('\n'),
	});

	const result = await validateTheme(directory);

	assert.ok(result.includes('theme/nested/colors.css:1: remote CSS resource: https://example.com/colors.css'));
	assert.ok(result.includes('theme/nested/colors.css:2: remote CSS resource: https://example.com/image.png'));
	assert.ok(result.includes('theme/nested/colors.css:3: remote CSS resource: https://example.com/retina.png'));
	assert.ok(result.includes('theme/nested/colors.css:4: remote CSS resource: //cdn.example.com/background.png'));
});

test('rejects theme manifest paths that escape the theme directory', async t => {
	const directory = await createTheme(t, {
		'theme/main.css': 'body { color: red; }',
	});
	const manifestPath = path.join(directory, 'manifest.json');
	const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

	manifest.main = '../outside.css';
	fs.writeFileSync(manifestPath, JSON.stringify(manifest));

	const result = await validateTheme(directory);

	assert.ok(result.some(error => error.includes('"main" must stay inside the theme directory')));
});

test('rejects previews that are not 16:9', async t => {
	const directory = await createTheme(t, {
		'theme/main.css': 'body { color: red; }',
	}, {width: 900, height: 900});

	const result = await validateTheme(directory);

	assert.ok(result.includes('Preview image must have a 16:9 aspect ratio (found 900x900)'));
});

if(currentThemes.length === 0)
{
	test('themes/ contains at least one theme to validate', () => {
		assert.fail('No theme directories found in themes/');
	});
}
else
{
	for(const theme of currentThemes)
	{
		test(`validates current theme "${theme.name}"`, async () => {
			const themeDirectory = path.join(themesDirectory, theme.name);
			const result = await validateTheme(themeDirectory);

			assert.deepEqual(result, [], result.join('\n'));
		});
	}
}
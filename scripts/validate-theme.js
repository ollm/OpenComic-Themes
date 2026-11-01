import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

function stripComments(css)
{
	return css.replace(/\/\*[\s\S]*?\*\//g, comment => comment.replace(/[^\n]/g, ' '));
}

function isRemoteResource(resource)
{
	const value = resource.trim().replace(/^(['"])(.*)\1$/s, '$2');

	return /^(?:[a-z][a-z\d+.-]*:)?\/\//iu.test(value) || /^(?:https?|ftp):/iu.test(value);
}

export function findRemoteCssResources(css, file = 'style.css')
{
	if(typeof css !== 'string')
		throw new TypeError('CSS content must be a string');

	const source = stripComments(css);
	const resources = [];

	function addResource(resource, index)
	{
		if(isRemoteResource(resource))
		{
			resources.push({
				file,
				line: source.slice(0, index).split('\n').length,
				url: resource.trim().replace(/^(['"])(.*)\1$/s, '$2'),
			});
		}
	}

	const urlPattern = /\burl\s*\(\s*(?:(["'])(.*?)\1|([^)]*?))\s*\)/giu;

	for(const match of source.matchAll(urlPattern))
	{
		addResource(match[2] ?? match[3] ?? '', match.index);
	}

	const importPattern = /@import\s+(["'])(.*?)\1/giu;

	for(const match of source.matchAll(importPattern))
	{
		addResource(match[2], match.index);
	}

	const imageSetPattern = /(?:-webkit-)?image-set\s*\(([\s\S]*?)\)/giu;

	for(const imageSet of source.matchAll(imageSetPattern))
	{
		const stringPattern = /(["'])(.*?)\1/gu;

		for(const resource of imageSet[1].matchAll(stringPattern))
		{
			addResource(resource[2], imageSet.index + imageSet[0].indexOf(resource[0]));
		}
	}

	return resources;
}

function resolveThemeFile(themeDirectory, relativePath, field, errors)
{
	if(typeof relativePath !== 'string' || relativePath.length === 0)
	{
		errors.push(`manifest.json: "${field}" must be a non-empty relative path`);
		return null;
	}

	const normalizedPath = relativePath.replaceAll('\\', '/');
	const segments = normalizedPath.split('/');

	if(normalizedPath.startsWith('/') || segments.includes('..') || /^[a-z]:/iu.test(normalizedPath))
	{
		errors.push(`manifest.json: "${field}" must stay inside the theme directory`);
		return null;
	}

	const absolutePath = path.resolve(themeDirectory, ...segments);
	const relativeToTheme = path.relative(themeDirectory, absolutePath);

	if(relativeToTheme === '' || relativeToTheme === '..' || relativeToTheme.startsWith(`..${path.sep}`))
	{
		errors.push(`manifest.json: "${field}" must point to a file inside the theme directory`);
		return null;
	}

	if(!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile())
	{
		errors.push(`manifest.json: "${field}" file does not exist: ${normalizedPath}`);
		return null;
	}

	return absolutePath;
}

function getCssFiles(directory)
{
	const cssFiles = [];

	for(const entry of fs.readdirSync(directory, {withFileTypes: true}))
	{
		const entryPath = path.join(directory, entry.name);

		if(entry.isDirectory())
			cssFiles.push(...getCssFiles(entryPath));
		else if(entry.isFile() && path.extname(entry.name).toLowerCase() === '.css')
			cssFiles.push(entryPath);
	}

	return cssFiles;
}

async function validatePreview(previewFile, errors)
{
	try
	{
		const {width, height} = await sharp(previewFile).metadata();

		if(!width || !height)
			errors.push('Preview image does not have readable dimensions');
		else if(width * 9 !== height * 16)
			errors.push(`Preview image must have a 16:9 aspect ratio (found ${width}x${height})`);
	}
	catch(error)
	{
		const message = error instanceof Error ? error.message : String(error);
		errors.push(`Could not read preview image: ${message}`);
	}
}

export async function validateTheme(themeDirectory)
{
	const directory = path.resolve(themeDirectory);
	const errors = [];

	if(!fs.existsSync(directory) || !fs.statSync(directory).isDirectory())
		return [`Theme directory does not exist: ${directory}`];

	const manifestPath = path.join(directory, 'manifest.json');
	const themeFilesDirectory = path.join(directory, 'theme');
	let manifest;

	if(!fs.existsSync(manifestPath))
	{
		errors.push('Missing manifest.json');
	}
	else
	{
		try
		{
			manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
		}
		catch(error)
		{
			if(error instanceof SyntaxError)
				errors.push(`manifest.json is not valid JSON: ${error.message}`);
			else
				throw error;
		}
	}

	if(manifest !== undefined)
	{
		if(manifest === null || typeof manifest !== 'object' || Array.isArray(manifest))
		{
			errors.push('manifest.json must contain a JSON object');
			manifest = null;
		}
		else
		{
			for(const field of ['name', 'version', 'author', 'description', 'opencomicVersion'])
			{
				if(typeof manifest[field] !== 'string' || manifest[field].trim() === '')
					errors.push(`manifest.json: "${field}" must be a non-empty string`);
			}

			const mainFile = resolveThemeFile(directory, manifest.main, 'main', errors);

			if(typeof manifest.main === 'string' && path.posix.extname(manifest.main).toLowerCase() !== '.css')
				errors.push('manifest.json: "main" must point to a CSS file');

			if(typeof manifest.main === 'string' && !manifest.main.replaceAll('\\', '/').startsWith('theme/'))
				errors.push('manifest.json: "main" must point inside the theme/ directory');

			if(mainFile)
			{
				const relativeMainFile = path.relative(themeFilesDirectory, mainFile);

				if(relativeMainFile === '..' || relativeMainFile.startsWith(`..${path.sep}`) || path.isAbsolute(relativeMainFile))
					errors.push('manifest.json: "main" must point inside the theme/ directory');
			}

			const previewFile = resolveThemeFile(directory, manifest.preview, 'preview', errors);

			if(typeof manifest.preview === 'string' && !['.jpg', '.jpeg', '.png'].includes(path.posix.extname(manifest.preview).toLowerCase()))
				errors.push('manifest.json: "preview" must be a JPG or PNG image');
			else if(previewFile)
				await validatePreview(previewFile, errors);
		}
	}

	if(!fs.existsSync(themeFilesDirectory) || !fs.statSync(themeFilesDirectory).isDirectory())
	{
		errors.push('Missing theme/ directory');
	}
	else
	{
		for(const cssFile of getCssFiles(themeFilesDirectory))
		{
			const relativeFile = path.relative(directory, cssFile).split(path.sep).join('/');
			const css = fs.readFileSync(cssFile, 'utf8');

			for(const resource of findRemoteCssResources(css, relativeFile))
				errors.push(`${resource.file}:${resource.line}: remote CSS resource: ${resource.url}`);
		}
	}

	return errors;
}

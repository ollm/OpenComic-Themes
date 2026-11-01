import fs from 'fs';
import p from 'path';
import sharp from 'sharp';
import sevenBin from '7zip-bin-full';
import node7z from 'node-7z';
import {validateTheme} from './validate-theme.js';

const path7z = sevenBin.path7z;

function addArchive(archivePath, sourcePath)
{
	return new Promise((resolve, reject) => {
		const archive = node7z.add(archivePath, sourcePath, {$bin: path7z});

		archive.on('data', () => {});
		archive.once('end', resolve);
		archive.once('error', reject);
	});
}

const distDirectory = p.resolve('dist');
const previewDirectory = p.resolve(distDirectory, 'previews');

const previewSizes = [
	1280,
	720,
    480,
];

if(!fs.existsSync(distDirectory))
	fs.mkdirSync(distDirectory, {recursive: true});

if(!fs.existsSync(previewDirectory))
	fs.mkdirSync(previewDirectory, {recursive: true});

const themesDirectory = p.resolve('themes');
const themes = fs.readdirSync(themesDirectory).filter(dir => {
	return fs.statSync(p.resolve(themesDirectory, dir)).isDirectory();
});

if(themes.length === 0)
{
	console.error('No themes found in themes/');
	process.exitCode = 1;
}

const catalog = [];

for(const theme of themes)
{
	const errors = await validateTheme(p.resolve(themesDirectory, theme));

	if(errors.length > 0)
	{
		console.error(`Invalid theme "${theme}":`);

		for(const error of errors)
			console.error(`- ${error}`);

		process.exitCode = 1;
	}
	else
	{
        const manifestPath = p.resolve(themesDirectory, theme, 'manifest.json');
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

		catalog.push({
			id: theme,
			...manifest,
		});

        const archivePath = p.resolve(distDirectory, `${theme}.zip`);
		await addArchive(archivePath, p.resolve(themesDirectory, theme));
        console.log(`Created archive for theme "${theme}" at ${archivePath}`);

        const themePreviewDirectory = p.resolve(previewDirectory, theme);

        if(!fs.existsSync(themePreviewDirectory))
            fs.mkdirSync(themePreviewDirectory, {recursive: true});

        for(const size of previewSizes)
        {
            const previewPath = p.resolve(themePreviewDirectory, `preview-${size}.png`);
            await sharp(p.resolve(themesDirectory, theme, manifest.preview)).resize(size, null).toFile(previewPath);
        }
	}
}

fs.writeFileSync(p.resolve(distDirectory, 'catalog.json'), JSON.stringify(catalog, null, 4));

if(process.exitCode !== 1)
	console.log(`Validated ${themes.length} theme(s).`);
# OpenComic Themes

Community themes for [OpenComic](https://github.com/ollm/OpenComic).

## Theme structure

Each theme lives in its own directory under `themes/`:

```text
themes/
└── midnight-blue/
    ├── manifest.json
    ├── preview.png
    └── theme/
        ├── main.css
        ├── colors.css
        └── assets/
            └── background.png
```

- Use a unique, lowercase directory name such as `midnight-blue`.
- The directory name is the theme's stable identifier. Do not rename the directory after publishing.
- `manifest.json` describes the theme. See [`manifest-sample.json`](./manifest-sample.json).
- Include a `preview.png` or `preview.jpg` image showing the theme in OpenComic. It must have a 16:9 aspect ratio, for example 1280x720.
- Put the CSS files and any local assets in `theme/`.
- `theme/main.css` is the required entry point. It may import other CSS files using relative paths.
- Keep theme files self-contained. Avoid remote imports and resources, custom CSS can affect privacy and application behavior and are not allowed.

## Manifest fields

The manifest should contain:

- `name`: display name.
- `version`: theme version using Semantic Versioning.
- `authors`: non-empty array of author objects. Each author must have a `name`, `email` and `url`.
- `description`: short summary of the theme.
- `opencomicVersion`: supported OpenComic version range using Semantic Versioning.
- `baseColor`: OpenComic's base theme (`blue`, `green`, `red`, `yellow`)
- `main`: path to the main CSS file, relative to the theme directory.
- `preview`: path to the preview image, relative to the theme directory.

Copy [`manifest-sample.json`](./manifest-sample.json) to `themes/<theme-id>/manifest.json` and update its values.
The theme ID is derived from `<theme-id>` and must not be added to the manifest.

## Creating a theme

Themes are CSS customizations. For instructions on adding a custom theme, changing colors, inspecting interface elements, and importing CSS files, see the [OpenComic custom themes documentation](https://opencomic.app/docs/guides/settings/custom-themes).

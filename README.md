# cwget: wget package manager for C

✨**cwget** is a single page helper (‼️**HTML FILE**‼️) for working with single file C libraries. It generates ready to paste commands and scripts to download a library, drop in a minimal sample program, and compile it on POSIX shells or Windows PowerShell. The page is fully static and is published as `docs/index.html` for GitHub Pages.

I call it a "package manager" as a joke, but it does somewhat manage package downloads, so it's not entirely inaccurate.

⚠️ Some information may not be valid. Yes, it's heavily AI-generated, I do my best to validate it.

## Features

- Catalog of single file C libraries (currently stb) with descriptions, tags, and license info
- One line download commands for POSIX (wget, curl) and PowerShell (curl, wget, `Invoke-WebRequest`)
- Install scripts that create the directory, download the library, write a sample C file, and compile it
- Minimal example program per library that is designed to compile if you follow the generated commands
- Configurable base directory, platform (POSIX or PowerShell), and theme (system, light, dark)
- Search across library name, file name, description, and tags, plus tag based filtering
- Table of contents and "works well with" links to jump between related libraries
- Copy to clipboard buttons for every command and code block, with small on page feedback
- No build step, no external dependencies, just static HTML, CSS, and JavaScript


⚠️ *I call it "a platform (POSIX or <u>PowerShell</u>)" to reduce confusion a bit; or maybe introduce more! Of course, PowerShell isn't a platform, but what is it? Should I call it "shell" or something else?*

## How it works

The page is served from `docs/index.html` and uses a single embedded XML catalog to describe all libraries. JavaScript reads this XML, computes platform specific commands and scripts, and renders the UI.

All logic runs client side. There is no server component and no build toolchain. Publishing to GitHub Pages is simply a matter of pushing `docs/index.html`, `docs/style.css`, and `docs/main.js`.



## Library catalog and XML data

The library metadata lives inside `docs/index.html` in a `<script type="application/xml" id="library-xml">` block. This XML is the single source of truth for:

- Library id and filesystem safe name
- Source file name and download URL
- Installation suffix directory under the configurable base directory
- Version, title, description, and categories (tags)
- Sample C program for the generated test file
- License summary and link to the full license
- "Works well with" relationships to other libraries

Example (`/docs/index.html`):

```xml
<script id="library-xml" type="application/xml">
<libraries baseDir="external" defaultVersion="0.0.0">
  <library id="stb_vorbis" fsName="stb_vorbis">
    <file>stb_vorbis.c</file>
    <url>https://raw.githubusercontent.com/nothings/stb/master/stb_vorbis.c</url>
    <suffixDir>stb</suffixDir>
    <version>1.22</version>
    <title>stb_vorbis.c</title>
    <description>Ogg Vorbis decoder in a single C file for loading .ogg audio into raw PCM.</description>
    <categories>audio, decoding, streaming</categories>
    <sampleCode><![CDATA[
#include <stdio.h>
#define STB_VORBIS_HEADER_ONLY
#include "stb_vorbis.c"

int main(void) {
    printf("stb_vorbis ready. Compile stb_vorbis.c with this file to decode Ogg Vorbis streams.\\n");
    return 0;
}
    ]]></sampleCode>
    <licenseSummary>Public domain / MIT dual license</licenseSummary>
    <licenseUrl>https://github.com/nothings/stb/blob/master/LICENSE</licenseUrl>
    <worksWellWith>stb_image, stb_image_write</worksWellWith>
  </library>
</libraries>
</script>
```



If you want to extend cwget with more libraries, or use the catalog from another tool, edit or parse this XML block directly.

To add or update entries:

- Open `docs/index.html`
- Locate the `<script id="library-xml" type="application/xml">` section
- Add or edit `<library>` elements following the existing structure
- Commit and push; GitHub Pages will serve the updated catalog



## Running locally

There is no build step. To run cwget locally:

- Clone the repository
- Open `docs/index.html` directly in a browser, or
- Serve the `docs` directory with any static HTTP server

All functionality (search, command generation, scripts, theming, settings) works the same locally and on GitHub Pages.

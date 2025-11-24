# cwget: wget package manager for C initial specification
Date: 2025-11-23

A00 Project overview and goals

This project is a single page HTML application that helps users download and wire up single file C libraries with copy paste commands and minimal example programs. The page reads a catalog of libraries from an embedded XML block, then generates ready to run commands and scripts for POSIX shells and Windows PowerShell.

The original version is focused on stb libraries only. The goal of this enhancement is to generalize the data model so it can describe any single file C library, not just stb, and to upgrade the UI so it is easier to search, filter, and reconfigure for a given project. The page must stay static, self contained, and dependency free. All logic runs in the browser with JavaScript.

B00 Data model and XML schema

The existing `<libraries>` root element stays as the high level container for all libraries. The schema is changed so that it no longer assumes stb specific layout.

The `<libraries>` element has an attribute `baseDir` which becomes the default root directory where libraries are installed. In the new version this default is `external`. The previous hard coded `external/stb` path is removed. The `<libraries>` element keeps `defaultVersion` as a fallback version string.

Each `<library>` element represents one C library. The following fields are required or optional.

Every library must have an identifier attribute `id` that is stable and unique across the catalog. Every library must have an attribute `fsName` that is safe for use in file names and test file names.

Every library must have a `<file>` element that contains the default file name for the main source or header, for example `stb_image.h`. Every library must have a `<url>` element that contains the absolute HTTP URL used to download that file.

Every library must have a `<suffixDir>` element. This suffix directory is appended to `baseDir` to form the installation directory for that library. For stb libraries this value is `stb`, so the full path becomes `external/stb`. Other libraries can set other suffixes or leave it empty to install directly into `external`.

Every library must have a `<version>` element. If the library does not know its real version yet, it must set this to the default version, for example `0.0.0`.

Every library must have a `<title>` element that contains the human readable name shown in the UI header. This can be the file name or a clearer name such as `stb_image.h` or `tinyxml2`.

Every library must have a `<description>` element. This description explains what the library does in one or more short sentences. One line is enough, but the text can be extended to give more context. The description must stay concise and concrete.

Every library must have a `<categories>` element. This element holds a comma separated list of tags, for example `graphics, image, loading` or `audio, decoding`. The JavaScript parses this string into an array of trimmed tags. Tags are used for search and tag based filtering.

Every library must have a `<sampleCode>` element that contains a full minimal example program in C. This sample must compile and run if the user follows the generated commands and uses the generated directory structure. The sample must include the correct `#include` lines and any required implementation macros for single file libraries. The sample code is stored inside CDATA in XML to avoid escaping issues.

Every library must have a `<licenseSummary>` element containing a short text summary of the license, for example `Public domain / MIT dual license` or `MIT license`. Every library must have a `<licenseUrl>` element containing a URL to the full license text, typically a file in the library repository.

Each library may have a `<worksWellWith>` element. This element contains a comma separated list of other library ids that are good companions. For example, `stb_image, stb_image_resize, stb_image_write`. The implementation must enforce a soft maximum of about six or seven related libraries per entry. If more ids are present, the UI must only show and link the first seven.

The XML schema must be written down in an internal comment or external document so that future contributors know which elements are required and how they are interpreted. The current stb entries must be migrated to this schema, including suffix directory `stb`, categories, license information, and a minimal but working sample program for each.

C00 Command generation behavior

The JavaScript must no longer hard code stb specific paths. All command generation must rely on `baseDir` from `<libraries>` and `suffixDir` from each `<library>`. For a given library, the POSIX installation directory is `baseDir + "/" + suffixDir` if suffixDir is non empty, or `baseDir` otherwise. The Windows installation directory is the same path but with slashes converted to backslashes.

For each library the page must generate download commands for the following cases. POSIX plus wget. POSIX plus curl. PowerShell plus curl alias. PowerShell plus wget alias. PowerShell plus `Invoke-WebRequest`. The commands must be derived from the same core values: URL, install directory, and local file name.

All commands must quote paths and URLs to handle spaces and special characters safely. On POSIX, the implementation must wrap paths and URLs in double quotes. It must escape existing double quotes in the data when constructing the commands. On Windows, the implementation must also use double quotes, and must ensure that embedded backslashes and quotes still produce a valid command line. The design goal is that users can paste commands into a typical terminal without editing even if they chose a base directory with spaces.

Each library must expose compile commands for the generated test program. At minimum the page must generate a POSIX compile command using `cc` and a Windows compile command using `cl` inside PowerShell. These commands must refer to the generated test file and include directories using the computed installation directories. They must be simple and robust, using warning flags as appropriate but not relying on external tools or build systems.

The UI must also generate an installation script per library. There are two script variants. One bash script for POSIX, and one PowerShell script for Windows. Each script performs the following actions in order. Create the installation directory. Download the library file. Create or overwrite the test C file with the full sample source code. Compile the test file to a binary. The scripts must be rendered in dedicated blocks for each library.

The installation scripts must also use proper quoting for paths and URLs. For bash, the implementation can use a here document for the sample code with a marker name that is chosen such that it does not collide with typical code content. For PowerShell, the implementation can use `Set-Content` or `Out-File` with a here string. The scripts must be readable and easy to understand, not minimised.

D00 User configurable settings and persistence

The user must be able to change the base installation directory from the UI. The page exposes a text field where the user can type a path such as `external` or `vendor/c_libs`. This base directory input applies globally to all libraries. The commands and scripts recompute live when the user changes the value. The default value for this input is read from `baseDir` in the XML.

The page also exposes controls for platform and theme. Platform selection at minimum allows the user to choose between POSIX and PowerShell. This selection controls which commands are shown by default and which script is highlighted. The theme control allows the user to select light mode, dark mode, or system default.

All user settings must be stored in `localStorage`. At minimum the implementation must persist the base directory, the last selected platform, and the theme selection. When the user visits or reloads the page, the JavaScript must read these values and apply them. If there is no stored value, the defaults from XML and system preference are used.

The UI must indicate which settings are user overridden. For example, if the base directory differs from the XML default, a small marker or tooltip near the input can say that this value comes from user settings. The exact visual indicator is flexible, but the user must be able to tell that they changed the value.

There must be a clear reset mechanism. A reset button must restore all settings to their defaults, including base directory, platform, and theme, and must clear the stored values in `localStorage`. The reset button should be easy to find near the settings controls.

E00 Search, tags, and table of contents

The page must provide a search bar at the top of the main content. When the user types into the search bar, the list of libraries filters in real time. The search must match on library title, file name, description text, and categories. A simple case insensitive substring search is sufficient for the expected number of libraries, but the code should be written in a way that keeps filtering responsive.

Tags from the `<categories>` element must be visible in the UI. For each library, the page shows its tags near the title or description. Each tag is clickable. When the user clicks a tag, the search filter updates to show libraries that contain that tag. The filter state must be visible, for example by showing the active query in the search box and a small indicator listing active tags.

The page must generate a table of contents dynamically from the catalog. The TOC lists all libraries by title and links to their section anchors. When the library set is filtered by search or tags, the TOC must update to show only the libraries currently visible. Clicking an entry in the TOC scrolls to that library section.

Anchor ids should be derived from library ids or titles in a stable way so that direct links to a given library remain valid across page reloads. Hash fragments in the URL can be used to preselect a library on page load.

F00 UI structure and interactions

The library list must present each library in a structured block. At the top of the block is the title, version, and categories. Below that sits the short description and license summary with a link to the full license. Below this header the content splits into several conceptual areas.

The basic download commands for the current platform and the current base directory must be visible by default. These include the POSIX or PowerShell commands listed earlier. These command blocks have copy to clipboard controls, so the user can copy the full command with one click.

Advanced content such as full install scripts, compile commands, and sample code must be collapsible. Each of these groups sits behind a toggle control with labels such as “Show install script”, “Show build commands”, and “Show sample program”. The default state is collapsed to keep the page compact. When the user expands a section, it reveals the corresponding code blocks and controls.

The “works well together” section must appear in each library that defines related ids. It should be a small block with a heading such as “Works well with”. It lists up to the first six or seven related libraries by title. Each item is clickable and scrolls to the corresponding library block. These links also work as suggestions; they do not change search filters by themselves unless explicitly designed to.

The license summary must be short and visible in the header area. The license link opens the external license page in a new tab or window.

All command and code blocks must have dedicated copy buttons. The implementation must use the Clipboard API when available, with a graceful fallback when it is not. After a successful copy the UI must show a small toast message or inline confirmation such as “Copied”. The toast should disappear automatically after a short delay.

The CSS must be updated so that command and code blocks wrap instead of forcing horizontal scrolling. For example, the implementation can use `white-space: pre-wrap` combined with `word-break` or `overflow-wrap` rules on `pre` and `code` elements to allow long commands to break across lines. The aim is to avoid horizontal scroll bars while preserving readability.

Light and dark theme support must be added. The base styles must support both themes, using CSS variables or similar. The default theme follows the system setting via `prefers-color-scheme`. When the user selects a specific theme with the toggle, that selection overrides the system preference and is stored in local storage. The body element can receive a class such as `theme-light` or `theme-dark` to control appearance.

G00 Install script generation details

For the POSIX install script, the generated content must include a shebang line `#!/usr/bin/env bash`. It must create the install directory with `mkdir -p`. It must download the library file with `curl` or `wget` using quoted paths and URLs, consistent with the main command generator. It must write the sample C program into the test file using a here document, with the file path and here document marker both quoted correctly. It must compile the test file using the same `cc` command that the main command generator shows.

For the PowerShell install script, the generated content must start with a comment header that states what the script does. It must create the directory using `New-Item -ItemType Directory -Force` or `mkdir` as a PowerShell alias. It must download the library file using `Invoke-WebRequest` or `curl` alias with an explicit `-OutFile` argument. It must write the sample C program into the test file using a here string with `@""@` or an appropriate variant, with the path quoted. It must compile the test program using `cl` and the same include directory options as the main command generator.

Both scripts must be generated from the library metadata at runtime. They must use the current base directory and suffix directory as configured by the user, not fixed values. This means the scripts must not contain hard coded `external` or `stb` paths except where those are still the default values.

H00 Implementation notes and non goals

The implementation must remain a single static HTML page with local JavaScript. No server side code or external services are involved. All catalog data stays in the embedded XML block.

The specification does not require a change of format from XML to JSON or other formats. XML remains the source of truth for library metadata in this phase.

The search implementation does not need indexing libraries. A straightforward in memory filter over the library list is enough. The emphasis is on clarity and reliability, not on micro optimizations.

The spec does not require additional build system integration code such as CMake generators beyond what is already described for scripts and compile commands. If such features are added later they should extend the same data model and follow the same design principles.




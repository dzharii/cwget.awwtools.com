# A00 Instructions for the coding agent LLM
Date: 2025-11-23

You have access to an existing static project that currently consists of a single HTML file named `index.html`. That file already contains HTML, CSS, JavaScript, and an embedded XML catalog with some sample data. You must treat that file as fully editable. You are allowed to change any part of it, split it into multiple files, and refactor the structure of the code and markup to satisfy the specification.

You must keep the project as a static site with no build step. There are no bundlers and no external dependencies. You must use plain HTML, CSS, and JavaScript only.

You must split CSS and JavaScript out of `index.html` into separate files. There must be a single CSS file included via a `<link rel="stylesheet" href="...">` tag, and a single JavaScript file included via a legacy `<script src="..."></script>` tag. Do not use ES module scripts. Do not use `type="module"`. You may use modern Web APIs where available, but script inclusion itself must be classic `<script src>`.

You must implement robust error handling around all parsing and rendering logic. If something goes wrong, such as malformed XML, missing required fields, or runtime exceptions in the main flow, the user must see a clear, human readable error message in the page. At the same time, the console must receive detailed logs of what happened.

You must implement extensive telemetry style logging to the browser console. Every major action in the application must log a message that includes at least the action name and important parameters or results. Use a consistent prefix so logs are easy to filter, such as `"[wget-pm]"`.

You have the full detailed specification of the enhanced behavior as a separate document. Use that specification as the source of truth for behavior and structure. The to do items below only describe what you need to verify after implementation, and what conditions must be true so that the feature is considered done.

B00 To do checklist and validation conditions

Item 1: Data model and XML schema
Confirm that the `<libraries>` root in `index.html` or in a separate data section uses `baseDir="external"` and `defaultVersion` as specified. Confirm that each `<library>` element contains at least these elements and attributes: `id`, `fsName`, `<file>`, `<url>`, `<suffixDir>`, `<version>`, `<title>`, `<description>`, `<categories>`, `<sampleCode>`, `<licenseSummary>`, `<licenseUrl>`. Confirm that `<categories>` is parsed into a list of tags and used by the code. Confirm that `<worksWellWith>` is optional, parsed as up to seven ids, and that the UI for a library shows at most seven related entries.

Item 2: Directory computation and quoting
Confirm in the JavaScript that install directories for each library are computed from `baseDir` and `suffixDir`, with POSIX using forward slashes and Windows using backslashes. Confirm that all generated commands and scripts wrap paths and URLs in quotes so they are safe when `baseDir` or file names contain spaces. Inspect the final command strings and ensure that any internal quotes are escaped correctly and do not break the command line.

Item 3: Command generation coverage
Confirm that for each library the code generates all required commands: POSIX wget, POSIX curl, PowerShell curl alias, PowerShell wget alias, and PowerShell `Invoke-WebRequest`, plus at least one POSIX compile command with `cc` and one Windows compile command with `cl`. Confirm that these commands are rendered in the UI in the correct sections for the selected platform and that they update when the base directory or platform selection changes.

Item 4: Install script generation
Confirm that for each library the code generates a POSIX install script and a PowerShell install script. In the POSIX script, confirm the presence of a bash shebang, creation of the directory, a download step, a step that writes the full sample C program to the test file, and a compile step that uses the same include paths as the main compile command. In the PowerShell script, confirm the presence of directory creation, download, writing of the sample C program to the test file via a here string or equivalent, and a compile step using `cl`. Confirm that both scripts use the current `baseDir` and `suffixDir` values, not hard coded paths.

Item 5: Sample program correctness
For each library, confirm that the `<sampleCode>` content is a complete C translation unit, including `#include` lines and any necessary `#define` for single file implementations. Confirm that the install scripts write this exact content to the test file. Confirm by inspection that a typical C compiler would accept this code given the generated include paths and downloaded library file. If an execution environment is available, compile and run at least one sample end to end to validate that the design works.

Item 6: Settings UI and persistence
Confirm that the page exposes a user editable base directory control, a platform selector, and a theme selector with three states: system, light, dark. Confirm that changing any of these controls immediately updates commands and scripts and the visual theme. Confirm that all these values are stored in `localStorage` and re applied on reload. Confirm that the UI clearly indicates when a setting has been overridden from the default. Confirm that there is a reset control that clears all stored settings, restores defaults, and triggers a visual update.

Item 7: Search, tags, and table of contents
Confirm that there is a search input, that typing into it filters the visible libraries, and that the filter considers title, file name, description, and categories. Confirm that categories for a library are shown as tags in the UI and that clicking a tag applies a filter equivalent to searching for that tag. Confirm that there is a table of contents built from the current set of libraries, that it updates when filters are applied, and that clicking a TOC entry scrolls to the correct library section. Confirm that each library has a stable anchor id derived from its data and that URL hash fragments select the correct entry when the page loads.

Item 8: UI toggles and related libraries
Confirm that advanced parts of each library block, including install scripts, build commands, and sample code, are hidden behind toggles such as “Show install script” and “Show sample program”. Confirm that these sections are collapsed by default and expand or collapse reliably when toggled. Confirm that the “works well with” section, when present, lists at most seven related libraries by title and that clicking a related library navigates or scrolls to its section.

Item 9: Copy to clipboard and visual feedback
Confirm that every command block and every code block that should be copyable has a copy button. Confirm that clicking the button calls the Clipboard API, falls back gracefully when not available, and logs the action. Confirm that on success a small toast or inline confirmation appears and then disappears after a short time. Confirm that copy operations work for long multi line scripts as well as single line commands.

Item 10: Error handling and logging
Confirm that XML parsing, library data extraction, and rendering are wrapped in try catch or equivalent error handling. Confirm that if parsing fails or required fields are missing, the page shows a readable error message to the user in the main content area, and does not fail silently. Confirm that all major actions such as initialization, XML parsing, library list construction, filter application, command generation, theme change, and copy actions log to the console with a consistent prefix. Confirm that error logs include stack traces or clear descriptions so a developer can diagnose issues.

Item 11: File separation and loading model
Confirm that CSS has been moved into a dedicated `.css` file and is linked from `index.html` with a `<link>` element. Confirm that all JavaScript has been moved into a single `.js` file and is included using `<script src="..."></script>` without `type="module"`. Confirm that there are no other script tags with inline code except for a minimal bootstrap if required, and that there are no imports or bundler artifacts. Confirm that the application still initializes correctly when loaded from a file URL or from a simple static web server.

Item 12: Layout and no horizontal scroll in code blocks
Confirm in the CSS that `pre` and `code` elements used for commands and samples are styled so that text wraps rather than forcing horizontal scrolling. Confirm that long commands and scripts are readable and that the rest of the layout remains usable in both light and dark themes. Confirm that the removal of horizontal scroll bars does not hide content or cause overlapping elements.





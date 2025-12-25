# TODO

- Data model and XML schema: verify `baseDir="external"` with `defaultVersion`, and that each library has required attributes/elements including categories, worksWellWith (up to 7 shown), and tags parsed.
- Directory computation and quoting: commands must compute install dirs from `baseDir` + `suffixDir`, use POSIX/Windows separators, and quote/escape paths and URLs safely.
- Command generation coverage: generate POSIX wget/curl, PowerShell curl/wget aliases, Invoke-WebRequest, plus cc (POSIX) and cl (Windows) compile commands that react to settings.
- Install script generation: emit POSIX and PowerShell scripts using current settings with directory creation, download, sample program write, and compile steps.
- Sample program correctness: ensure each `<sampleCode>` is a complete C translation unit written verbatim in scripts and compatible with generated include paths.
- Settings UI and persistence: expose base dir, platform selector, theme selector (system/light/dark), persist to localStorage, indicate overrides, include reset control.
- Search, tags, and table of contents: live search over title/file/description/categories, clickable tags that filter, dynamic TOC that follows filters and anchors.
- UI toggles and related libraries: advanced sections collapsed by default; toggles for install scripts/build commands/sample code; works-well-with shows up to seven linked libraries.
- Copy to clipboard and feedback: copy buttons on commands/code with Clipboard API + fallback, logging, and visible success feedback for single/multi-line content.
- Error handling and logging: wrap parsing/rendering in try/catch, show readable errors in UI, log major actions and errors with consistent prefix (e.g., `[wget-pm]`).
- File separation and loading model: move CSS to a single .css file and JS to a single classic script; no inline scripts except minimal bootstrap; works from file:// or static server.
- Layout and wrapping: style `pre`/`code` to wrap text without horizontal scroll while keeping readability in both light and dark themes.

A00 v00 Scope and goals
This specification defines a Bash-based command line client, cwget.sh, that consumes the cwget web catalog, maintains a short-lived local cache of the catalog data, supports search and inspection of packages, and installs selected packages by downloading their declared files into a user-chosen base directory. The client targets Linux shell environments and must run in POSIX-like shells with Bash available.

Primary goals are: predictable behavior, minimal dependencies, safe file writes, clear errors, and compatibility with common Linux distributions. Non-goals are: implementing full build automation for every library, managing dependency graphs, or maintaining a central registry beyond the published cwget catalog.

Endpoint: https://cwget.awwtools.com/

B00 v00 Catalog source and data model
B00 v00.1 Catalog source
The authoritative catalog is embedded in the cwget HTML page as an XML payload inside a script tag:

```html
<script id="library-xml" type="application/xml">
  <libraries baseDir="external" defaultVersion="0.0.0">
    <library id="rgfw" fsName="rgfw">
      <files>
        <file path="RGFW.h" url="https://raw.githubusercontent.com/ColleagueRiley/RGFW/main/RGFW.h" />
      </files>
      <suffixDir>rgfw</suffixDir>
      <version>1.8.1</version>
      <title>RGFW.h</title>
      <description>Single-header C99 window and input framework ...</description>
      <categories>windowing, graphics, input</categories>
      <sampleCode><![CDATA[ ... ]]></sampleCode>
      <licenseSummary>Zlib license</licenseSummary>
      <licenseUrl>...</licenseUrl>
      <worksWellWith>stb_image, stb_truetype, olive_c</worksWellWith>
      <documentation> ... </documentation>
    </library>
  </libraries>
</script>
```

The client must retrieve the HTML page, extract the XML block whose id is library-xml, parse it, and treat it as the package database.

B00 v00.2 Data entities
The client models the following fields per library:

* id: unique identifier used in commands (required).
* fsName: filesystem name used for generated test file naming and display (optional; default to id).
* suffixDir: directory name under the base install directory (required).
* files: one or more file entries with:

  * path: relative path (file name or subpath) under install directory (required).
  * url: absolute URL for download (required).
* version: string (optional; defaultVersion from root if missing).
* title: display name (optional; default to fsName).
* description: display text (required).
* categories: comma-separated tags (required).
* sampleCode: sample C code block (required).
* licenseSummary and licenseUrl: required.
* worksWellWith: optional comma-separated list of other library ids.
* documentation links: optional for CLI display; not required for core operations.

The client may store additional derived fields:

* installDir = baseDir + "/" + suffixDir
* targetFilePaths = installDir + "/" + each file.path

C00 v00 Cache and refresh behavior
C00 v00.1 Cache location
The client stores cache files under an OS-appropriate directory, chosen in this order:

1. $XDG_CACHE_HOME/cwget if XDG_CACHE_HOME is set and writable
2. $HOME/.cache/cwget if HOME is set and writable
3. /tmp/cwget-$USER (or /tmp/cwget if USER is unavailable)

The cache directory must be created with safe permissions (0700 preferred). If creation fails, the client may fall back to a temporary directory for the current run only.

C00 v00.2 Cache files
Minimum cache artifacts:

* catalog.html: last fetched HTML
* catalog.xml: extracted XML payload from the HTML
* meta: a small metadata file containing fetch timestamp, source URL, and optional ETag/Last-Modified values

C00 v00.3 Cache TTL and refresh rules
Default TTL is 20 minutes.

For any command that needs the catalog, cwget.sh must:

* If cache is missing or older than TTL: refresh.
* If cache is present and within TTL: use cached xml.
* Provide a --refresh flag to force refresh regardless of age.
* Provide a --offline flag to forbid network access and fail if cache is missing.

Optional optimization if supported by the downloader:

* If meta contains ETag or Last-Modified, use conditional requests to reduce bandwidth. If server does not support, fall back to normal fetch.

C00 v00.4 Concurrency
If two instances run concurrently, they must avoid corrupting the cache. Use a lock file in the cache dir (for example with flock if available, or mkdir-based lock) around refresh operations. If locking is not available, accept the small risk but still write cache updates atomically (write to temp file then rename).

D00 v00 Command line interface
D00 v00.1 General form
cwget.sh [global options] <command> [command args]

Global options:

* --base-dir <path> : override base installation directory for this invocation.
* --cache-ttl <seconds|minutes> : override TTL (default 20m).
* --cache-dir <path> : override cache directory.
* --source-url <url> : override the default cwget HTML URL.
* --refresh : force catalog refresh.
* --offline : do not attempt network requests.
* --json : emit machine-readable output for list/search/info where feasible.
* --quiet / --verbose : control output.
* --help : show usage.

Default source URL is the cwget site root that serves the HTML page.

D00 v00.2 Commands
Required commands:

1. help

* cwget.sh help
* Displays usage, commands, examples, and exits 0.

2. update

* cwget.sh update
* Refreshes cache if stale (or always with --refresh).
* Prints summary: source URL, number of libraries, cache age.

3. search

* cwget.sh search <query>
* Searches by matching query against:

  * id
  * fsName
  * title
  * description
  * categories
  * file paths
* Output: list of matches with id, version, short title/description snippet.
* Supports wildcard patterns:

  * If query includes * or ? treat as shell-style wildcard against a combined searchable string or at least id/title.
  * If query does not include wildcards treat as case-insensitive substring match.
* Additional flags:

  * --tag <tag> : restrict to a category tag
  * --limit <n> : cap output
  * --liked : optional future; ignore for v00 if not implementing bookmarks

4. info

* cwget.sh info <id>
* Prints detailed metadata:

  * id, version, title
  * description
  * categories
  * license summary + URL
  * file list with URLs
  * default install directory as computed from baseDir + suffixDir
  * worksWellWith list
  * documentation links (optional)
* If --json is provided, emit structured JSON.

5. install

* cwget.sh install <id> [--dir <baseDirOverride>] [--dry-run] [--force] [--print-command]
* Resolves the library by id (exact match).
* Determines download tool preference:

  * If wget exists: use wget.
  * Else if curl exists: use curl.
  * Else fail with actionable error.
* Creates install directory (baseDir/suffixDir).
* Downloads all files to their target paths.
* Verifies downloads minimally:

  * non-empty file
  * HTTP success exit code
* --dry-run prints what would be done without writing.
* --force overwrites existing files; otherwise do not overwrite and return non-zero if conflicts.
* --print-command prints the equivalent one-liner commands similar to the web UI (best-effort).

Optional (nice-to-have) commands:

* list: lists all packages (with limit/paging).
* path <id>: prints the computed install directory and file paths.
* sample <id>: prints sampleCode to stdout.

E00 v00 Search semantics and wildcard behavior
E00 v00.1 Matching rules

* Case-insensitive.
* Normalize whitespace in fields before matching.
* Search space for each library is a concatenation of:
  id, fsName, title, description, categories joined by space, file paths joined by space.

E00 v00.2 Wildcards
If query contains glob metacharacters (*, ?, [..]) then treat it as a glob pattern and match it against:

* id and fsName at minimum, and optionally the full concatenated search space.

Implementation detail for Bash:

* Use a function that evaluates pattern matching with [[ $candidate == $pattern ]] after lowercasing both, but avoid expanding against filesystem. The pattern must not be unquoted in a context that expands to real files.

F00 v00 Install semantics
F00 v00.1 Base directory resolution
Base directory selection precedence:

1. --base-dir or --dir value passed for install
2. Environment variable CWGET_BASE_DIR (optional, if you choose to support)
3. Default baseDir attribute from the XML root (commonly "external")

Normalize baseDir:

* trim whitespace
* remove trailing slashes
* use forward slashes for internal concatenation (Linux-friendly)

Install target for each file: <baseDir>/<suffixDir>/<file.path>

F00 v00.2 Directory creation

* Ensure <baseDir>/<suffixDir> exists (mkdir -p).
* If file.path contains subdirectories, ensure those are created as well.
* Do not allow path traversal:

  * Reject any file.path containing ".." segments or starting with "/" to prevent writes outside install dir.

F00 v00.3 Download tool behavior
wget mode:

* Prefer: wget -O <target> <url>
* Consider: --https-only where supported, and --quiet based on verbosity.

curl mode:

* Prefer: curl -L <url> -o <target>
* Use -f to fail on HTTP errors if available: curl -fL <url> -o <target>

Retry policy:

* Small retry count for transient errors (for example 2-3) is acceptable.

Atomic writes:

* Download to <target>.tmp then mv to <target> to avoid partially written files.

F00 v00.4 Exit codes
Define consistent exit codes:

* 0 success
* 1 generic failure
* 2 invalid usage / unknown command
* 3 network failure / download tool missing
* 4 cache failure
* 5 package not found
* 6 install conflict (file exists and not --force)

G00 v00 Parsing requirements
G00 v00.1 Extraction of XML from HTML
The client must extract the content of the script tag with id="library-xml".

Extraction approach constraints:

* Must not require heavy dependencies.
* Preferred tools: sed, awk, grep, perl (optional), python (optional) if present.

Robustness requirements:

* Handle leading/trailing whitespace.
* Handle large XML payloads.
* Ensure extraction stops at the closing </script> for that block.

Illustrative approach (not full code):

* Find the line containing `<script id="library-xml"` then capture subsequent lines until `</script>` and strip the opening tag line content up to `>` and remove the closing tag line.

G00 v00.2 XML parsing
The client must parse enough XML to support:

* enumerating library nodes
* reading attributes id, fsName
* reading child text nodes (suffixDir, version, title, description, categories, licenseSummary, licenseUrl, worksWellWith)
* reading multiple file entries with attributes path and url

Preferred strategy in Bash is a streaming, line-oriented parser tailored to the known schema, because full XML parsing in pure Bash is fragile. Acceptable minimal dependency options:

* xmllint if available (libxml2) for robust XPath extraction.
* python3 -c script to parse XML if python3 is available.
* fallback to awk/sed parsing if neither xmllint nor python3 exist, with documented limitations.

The specification requires implementing at least one robust path (xmllint or python3). If neither exists, cwget.sh should fail with a clear message that it cannot parse XML without either xmllint or python3, unless you explicitly choose to implement a best-effort parser.

H00 v00 Output formatting
H00 v00.1 Human output
Keep output short and predictable:

* search: one line per match, for example:
  rgfw  v1.8.1  RGFW.h - Single-header C99 window and input framework...
* info: multi-line blocks with clear labels.

H00 v00.2 JSON output
When --json is used, output must be valid JSON on stdout. Errors still go to stderr. For search, output an array of objects. For info, output a single object.

I00 v00 Configuration and environment
Optional environment variables:

* CWGET_BASE_DIR: default base installation directory.
* CWGET_CACHE_DIR: override cache directory.
* CWGET_SOURCE_URL: override source URL.
* CWGET_CACHE_TTL: override TTL.

If supported, environment values must be overridden by explicit flags.

J00 v00 Security and safety requirements

* Enforce path traversal protections on file.path before writing.
* Do not execute downloaded code.
* Do not eval untrusted content.
* Use HTTPS URLs as provided; optionally warn on non-HTTPS.
* Avoid printing secrets; none are expected.

K00 v00 Diagnostics and logging

* --verbose prints:

  * whether cache was used or refreshed
  * chosen downloader (wget/curl)
  * each file download start and completion
* Standard mode prints only essential messages.
* Errors must include actionable steps (install wget/curl, run update, use --refresh, etc).

L00 v00 Examples
Example flows (illustrative):

```bash
# update catalog
./cwget.sh update

# search for stb image related
./cwget.sh search stb_image

# inspect a package
./cwget.sh info rgfw

# install into default base dir (from catalog or config)
./cwget.sh install rgfw

# install into a custom base dir
./cwget.sh install rgfw --dir ./external

# offline search using cached DB
./cwget.sh --offline search vorbis
```

M00 v00 Acceptance criteria
The implementation is considered conforming if:

* It refreshes and caches the catalog with TTL default 20 minutes.
* It can search case-insensitively across id/title/description/tags/file paths.
* It can display info for a package by id.
* It can install a package by downloading all its declared files using wget or curl, with safe directory creation and path traversal prevention.
* It provides clear exit codes and error messages for missing tools, missing cache in offline mode, and missing packages.

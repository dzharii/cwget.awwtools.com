# spec-001-cwget.sh test cases

## Notes
- Use a local HTML source for repeatable tests: `docs/index.html` contains a `library-xml` block.
- Use `--source-url file:///absolute/path/to/docs/index.html` to avoid network access.
- For commands that require cache, run `update` first (or use `--refresh`).

## Test cases
1. **Help and usage**
   - Command: `./cwget.sh help`
   - Expect: usage text, exit 0.

2. **Unknown command**
   - Command: `./cwget.sh no-such-command`
   - Expect: error message, exit 2.

3. **Update with local file source**
   - Command: `./cwget.sh --source-url file:///ABS/docs/index.html update --refresh`
   - Expect: cache populated, summary with source URL and library count.

4. **Offline update blocked**
   - Command: `./cwget.sh --offline update`
   - Expect: error about offline refresh, exit 3.

5. **Offline search with cache present**
   - Precondition: run update with local file source.
   - Command: `./cwget.sh --offline search rgfw`
   - Expect: results from cached catalog even if TTL expired; warning if stale.

6. **Search substring match (case-insensitive)**
   - Command: `./cwget.sh search rgfw`
   - Expect: match includes id `rgfw`.

7. **Search wildcard match**
   - Command: `./cwget.sh search "stb_*"`
   - Expect: entries whose id/fsName or searchable fields match wildcard.

8. **Search with tag filter**
   - Command: `./cwget.sh search stb --tag graphics`
   - Expect: only results that include `graphics` in categories.

9. **Search JSON output**
   - Command: `./cwget.sh --json search rgfw`
   - Expect: valid JSON array on stdout.

10. **Info output (human)**
    - Command: `./cwget.sh info rgfw`
    - Expect: labeled fields including description, categories, license, file list.

11. **Info output (JSON)**
    - Command: `./cwget.sh --json info rgfw`
    - Expect: valid JSON object on stdout with files list.

12. **Info for missing package**
    - Command: `./cwget.sh info does-not-exist`
    - Expect: "package not found" error, exit 5.

13. **List with limit**
    - Command: `./cwget.sh list --limit 3`
    - Expect: exactly 3 lines.

14. **Path command**
    - Command: `./cwget.sh path rgfw`
    - Expect: first line is installDir, followed by file paths.

15. **Sample command**
    - Command: `./cwget.sh sample rgfw`
    - Expect: sample C code printed.

16. **Install dry-run**
    - Command: `./cwget.sh install rgfw --dry-run --dir ./external-test`
    - Expect: prints planned downloads; no files created.

17. **Install print-command**
    - Command: `./cwget.sh install rgfw --print-command --dir ./external-test`
    - Expect: prints mkdir + wget/curl commands.

18. **Install conflict**
    - Precondition: create a dummy target file in `./external-test/<suffixDir>/RGFW.h`
    - Command: `./cwget.sh install rgfw --dir ./external-test`
    - Expect: conflict error, exit 6.

19. **Install conflict with --force**
    - Precondition: same as conflict case.
    - Command: `./cwget.sh install rgfw --dir ./external-test --force --dry-run`
    - Expect: dry-run succeeds without conflict error.

20. **Path traversal protection**
    - Precondition: modify cache XML to include a file path like `../evil`.
    - Command: `./cwget.sh install <id-with-bad-path>`
    - Expect: error about invalid file path, exit 4.

21. **Cache TTL behavior**
    - Command: `./cwget.sh --cache-ttl 1 update --refresh` then wait 2 seconds, run `./cwget.sh update`
    - Expect: second update refreshes due to TTL.

22. **Downloader missing**
    - Precondition: run in an environment without `wget` or `curl`.
    - Command: `./cwget.sh update`
    - Expect: error advising to install wget/curl, exit 3.

23. **Cache dir override**
    - Command: `./cwget.sh --cache-dir ./tmp-cache --source-url file:///ABS/docs/index.html update --refresh`
    - Expect: cache created under `./tmp-cache`.

24. **Base dir precedence**
    - Precondition: set `CWGET_BASE_DIR` and also pass `--base-dir`.
    - Command: `CWGET_BASE_DIR=envdir ./cwget.sh --base-dir clidir path rgfw`
    - Expect: installDir uses `clidir` (CLI override wins).

#!/usr/bin/env bash
#
# Tests run:
# 
#  bash -n cwget.sh
#  ./cwget.sh help
#  ./cwget.sh update --refresh
#  ./cwget.sh search rgfw
#  ./cwget.sh info rgfw
#  ./cwget.sh path rgfw
#  ./cwget.sh install rgfw --dry-run --dir ./external-test
#  ./cwget.sh --offline search rgfw
# 

SCRIPT_NAME="$(basename "$0")"
DEFAULT_SOURCE_URL="https://cwget.awwtools.com/"
DEFAULT_CACHE_TTL="20m"

base_dir_override=""
cache_ttl_override=""
cache_dir_override=""
source_url_override=""
refresh=0
offline=0
json_output=0
quiet=0
verbose=0

EXIT_GENERIC=1
EXIT_USAGE=2
EXIT_NETWORK=3
EXIT_CACHE=4
EXIT_NOT_FOUND=5
EXIT_CONFLICT=6

log() {
  if [ "$quiet" -eq 0 ]; then
    printf '%s\n' "$*"
  fi
}

vlog() {
  if [ "$verbose" -eq 1 ] && [ "$quiet" -eq 0 ]; then
    printf '%s\n' "$*"
  fi
}

warn() {
  if [ "$quiet" -eq 0 ]; then
    printf 'warning: %s\n' "$*" >&2
  fi
}

die() {
  local msg="$1"
  local code="${2:-$EXIT_GENERIC}"
  printf 'error: %s\n' "$msg" >&2
  exit "$code"
}

print_usage() {
  cat <<EOF
Usage: $SCRIPT_NAME [global options] <command> [args]

Global options:
  --base-dir <path>   Override base install directory
  --cache-ttl <time>  Cache TTL in seconds or minutes (e.g. 1200, 20m)
  --cache-dir <path>  Override cache directory
  --source-url <url>  Override catalog HTML URL
  --refresh           Force refresh of catalog
  --offline           Do not use network; fail if cache missing
  --json              Emit JSON for list/search/info/path
  --quiet             Less output
  --verbose           More output
  --help              Show this help

Commands:
  help
  update
  search <query> [--tag <tag>] [--limit <n>]
  info <id>
  install <id> [--dir <path>] [--dry-run] [--force] [--print-command]
  list [--limit <n>]
  path <id>
  sample <id>
EOF
}

trim() {
  printf '%s' "$1" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'
}

normalize_base_dir() {
  local dir
  dir="$(trim "$1")"
  while [ -n "$dir" ] && [ "${dir%/}" != "$dir" ]; do
    dir="${dir%/}"
  done
  printf '%s' "$dir"
}

parse_ttl() {
  local val
  val="$(trim "$1")"
  if [[ "$val" =~ ^[0-9]+$ ]]; then
    printf '%s' "$val"
    return 0
  fi
  if [[ "$val" =~ ^([0-9]+)[[:space:]]*(s|sec|secs|second|seconds)$ ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
    return 0
  fi
  if [[ "$val" =~ ^([0-9]+)[[:space:]]*(m|min|mins|minute|minutes)$ ]]; then
    printf '%s' "$((BASH_REMATCH[1] * 60))"
    return 0
  fi
  return 1
}

have_cmd() {
  command -v "$1" >/dev/null 2>&1
}

select_fetcher() {
  if have_cmd wget; then
    printf '%s' "wget"
    return 0
  fi
  if have_cmd curl; then
    printf '%s' "curl"
    return 0
  fi
  return 1
}

fetch_url() {
  local url="$1"
  local target="$2"
  local fetcher
  fetcher="$(select_fetcher)" || return 1

  if [ "$fetcher" = "wget" ]; then
    if [ "$verbose" -eq 1 ]; then
      wget -O "$target" "$url"
    else
      wget -q -O "$target" "$url"
    fi
  else
    if [ "$verbose" -eq 1 ]; then
      curl -fL -o "$target" "$url"
    else
      curl -fsSL -o "$target" "$url"
    fi
  fi
}

download_file() {
  local url="$1"
  local target="$2"
  local tmp="${target}.tmp.$$"
  local fetcher

  fetcher="$(select_fetcher)" || return "$EXIT_NETWORK"

  if [ "$fetcher" = "wget" ]; then
    if [ "$verbose" -eq 1 ]; then
      wget -O "$tmp" "$url"
    else
      wget -q -O "$tmp" "$url"
    fi
  else
    if [ "$verbose" -eq 1 ]; then
      curl -fL -o "$tmp" "$url"
    else
      curl -fsSL -o "$tmp" "$url"
    fi
  fi

  if [ ! -s "$tmp" ]; then
    rm -f "$tmp"
    return "$EXIT_NETWORK"
  fi

  mv -f "$tmp" "$target"
  return 0
}

cache_dir_candidates() {
  local candidates=()
  if [ -n "$cache_dir_override" ]; then
    candidates+=("$cache_dir_override")
  fi
  if [ -n "${CWGET_CACHE_DIR:-}" ]; then
    candidates+=("$CWGET_CACHE_DIR")
  fi
  if [ -n "${XDG_CACHE_HOME:-}" ]; then
    candidates+=("${XDG_CACHE_HOME}/cwget")
  fi
  if [ -n "${HOME:-}" ]; then
    candidates+=("${HOME}/.cache/cwget")
  fi
  local user="${USER:-}"
  if [ -n "$user" ]; then
    candidates+=("/tmp/cwget-$user")
  else
    candidates+=("/tmp/cwget")
  fi
  printf '%s\n' "${candidates[@]}"
}

ensure_cache_dir() {
  local dir="$1"
  if [ -z "$dir" ]; then
    return 1
  fi
  if mkdir -p -m 700 "$dir" 2>/dev/null; then
    if [ -w "$dir" ]; then
      printf '%s' "$dir"
      return 0
    fi
  fi
  return 1
}

resolve_cache_dir() {
  local candidate
  while IFS= read -r candidate; do
    if ensure_cache_dir "$candidate" >/dev/null; then
      ensure_cache_dir "$candidate"
      return 0
    fi
  done < <(cache_dir_candidates)

  local tmp_root="${TMPDIR:-/tmp}"
  local tmp_dir="${tmp_root}/cwget-$$"
  if mkdir -p -m 700 "$tmp_dir" 2>/dev/null; then
    warn "using temporary cache directory $tmp_dir"
    printf '%s' "$tmp_dir"
    return 0
  fi
  die "unable to create cache directory" "$EXIT_CACHE"
}

file_mtime() {
  local path="$1"
  if have_cmd stat; then
    if stat -c %Y "$path" >/dev/null 2>&1; then
      stat -c %Y "$path"
      return 0
    fi
    if stat -f %m "$path" >/dev/null 2>&1; then
      stat -f %m "$path"
      return 0
    fi
  fi
  if have_cmd python3; then
    python3 - "$path" <<PY
import os, sys
try:
    print(int(os.path.getmtime(sys.argv[1])))
except Exception:
    sys.exit(1)
PY
  fi
}

acquire_lock() {
  local lock_dir="$1"
  local attempts=0
  while ! mkdir "$lock_dir" 2>/dev/null; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 30 ]; then
      return 1
    fi
    sleep 1
  done
  printf '%s\n' "$$" > "${lock_dir}/pid" 2>/dev/null || true
  return 0
}

release_lock() {
  local lock_dir="$1"
  rm -rf "$lock_dir"
}

extract_xml() {
  local html="$1"
  local xml="$2"
  awk '
    BEGIN { in_block=0 }
    /<script[^>]*id=["'\''"]library-xml["'\''"][^>]*>/ {
      in_block=1
      sub(/.*<script[^>]*id=["'\''"]library-xml["'\''"][^>]*>/, "")
    }
    in_block {
      if ($0 ~ /<\/script>/) {
        sub(/<\/script>.*/, "")
        print
        exit
      }
      print
    }
  ' "$html" > "$xml"
}

require_python() {
  if ! have_cmd python3; then
    die "python3 is required to parse the catalog XML" "$EXIT_CACHE"
  fi
}

python_catalog() {
  local cmd="$1"
  shift
  CWGET_PY_CMD="$cmd" CWGET_XML="$CACHE_XML" "$@" python3 - <<'PY'
import fnmatch
import json
import os
import sys
import xml.etree.ElementTree as ET

cmd = os.environ.get("CWGET_PY_CMD")
xml_path = os.environ.get("CWGET_XML")
query = os.environ.get("CWGET_QUERY", "")
tag = os.environ.get("CWGET_TAG", "")
limit_raw = os.environ.get("CWGET_LIMIT", "")
json_flag = os.environ.get("CWGET_JSON") == "1"
lib_id = os.environ.get("CWGET_ID", "")
base_dir_effective = os.environ.get("CWGET_BASE_DIR_EFFECTIVE", "")

def die(msg, code=1):
    sys.stderr.write(f"{msg}\n")
    sys.exit(code)

if not xml_path or not os.path.exists(xml_path):
    die("catalog XML not found", 4)

try:
    tree = ET.parse(xml_path)
except Exception as exc:
    die(f"failed to parse XML: {exc}", 4)

root = tree.getroot()
root_base_dir = (root.get("baseDir") or "").strip() or "external"
default_version = (root.get("defaultVersion") or "").strip()

def text_for(node, tag):
    found = node.find(tag)
    if found is None or found.text is None:
        return ""
    return found.text

def norm_ws(value):
    return " ".join(str(value).split())

def split_tags(value):
    return [t.strip() for t in value.split(",") if t.strip()]

def lib_to_dict(node):
    lib_id = (node.get("id") or "").strip()
    fs_name = (node.get("fsName") or "").strip() or lib_id
    suffix_dir = norm_ws(text_for(node, "suffixDir"))
    version = norm_ws(text_for(node, "version")) or default_version
    title = norm_ws(text_for(node, "title")) or fs_name
    description = norm_ws(text_for(node, "description"))
    categories = norm_ws(text_for(node, "categories"))
    sample_code = text_for(node, "sampleCode").rstrip("\n")
    license_summary = norm_ws(text_for(node, "licenseSummary"))
    license_url = norm_ws(text_for(node, "licenseUrl"))
    works = norm_ws(text_for(node, "worksWellWith"))
    documentation = norm_ws(text_for(node, "documentation"))
    files = []
    files_node = node.find("files")
    if files_node is not None:
        for f in files_node.findall("file"):
            path = (f.get("path") or "").strip()
            url = (f.get("url") or "").strip()
            files.append({"path": path, "url": url})
    return {
        "id": lib_id,
        "fsName": fs_name,
        "suffixDir": suffix_dir,
        "version": version,
        "title": title,
        "description": description,
        "categories": categories,
        "sampleCode": sample_code,
        "licenseSummary": license_summary,
        "licenseUrl": license_url,
        "worksWellWith": works,
        "documentation": documentation,
        "files": files,
    }

libraries = [lib_to_dict(node) for node in root.findall("library")]

def render_search(matches):
    if json_flag:
        json.dump(matches, sys.stdout)
        return
    for lib in matches:
        snippet = norm_ws(lib.get("description", ""))
        if len(snippet) > 80:
            snippet = snippet[:77].rstrip() + "..."
        version = lib.get("version") or ""
        title = lib.get("title") or ""
        print(f"{lib.get('id')}  v{version}  {title} - {snippet}")

def render_info(lib):
    if json_flag:
        out = dict(lib)
        out["categories"] = split_tags(lib.get("categories", ""))
        out["worksWellWith"] = split_tags(lib.get("worksWellWith", ""))
        if base_dir_effective:
            out["installDir"] = f"{base_dir_effective}/{lib.get('suffixDir')}"
        json.dump(out, sys.stdout)
        return
    print(f"id: {lib.get('id')}")
    print(f"version: {lib.get('version')}")
    print(f"title: {lib.get('title')}")
    print(f"description: {lib.get('description')}")
    print(f"categories: {lib.get('categories')}")
    print(f"license: {lib.get('licenseSummary')}")
    print(f"licenseUrl: {lib.get('licenseUrl')}")
    if base_dir_effective:
        print(f"installDir: {base_dir_effective}/{lib.get('suffixDir')}")
    works = lib.get("worksWellWith")
    if works:
        print(f"worksWellWith: {works}")
    documentation = lib.get("documentation")
    if documentation:
        print(f"documentation: {documentation}")
    print("files:")
    for f in lib.get("files", []):
        print(f"  - {f.get('path')} -> {f.get('url')}")

def find_lib(lib_id):
    for lib in libraries:
        if lib.get("id") == lib_id:
            return lib
    return None

if cmd == "count":
    print(len(libraries))
    sys.exit(0)

if cmd == "root-base-dir":
    print(root_base_dir)
    sys.exit(0)

if cmd in ("search", "list"):
    limit = None
    if limit_raw:
        try:
            limit = int(limit_raw)
        except ValueError:
            die("invalid limit", 2)
    tag_lower = tag.strip().lower()
    wildcard = any(ch in query for ch in "*?[]")
    pattern = query.lower()
    results = []
    for lib in libraries:
        if tag_lower:
            lib_tags = [t.lower() for t in split_tags(lib.get("categories", ""))]
            if tag_lower not in lib_tags:
                continue
        if cmd == "list":
            match = True
        elif wildcard:
            id_lower = lib.get("id", "").lower()
            fs_lower = lib.get("fsName", "").lower()
            search_space = " ".join([
                id_lower,
                fs_lower,
                lib.get("title", "").lower(),
                lib.get("description", "").lower(),
                lib.get("categories", "").lower(),
                " ".join([f.get("path", "").lower() for f in lib.get("files", [])]),
            ])
            match = (
                fnmatch.fnmatchcase(id_lower, pattern)
                or fnmatch.fnmatchcase(fs_lower, pattern)
                or fnmatch.fnmatchcase(search_space, pattern)
            )
        else:
            search_space = " ".join([
                lib.get("id", ""),
                lib.get("fsName", ""),
                lib.get("title", ""),
                lib.get("description", ""),
                lib.get("categories", ""),
                " ".join([f.get("path", "") for f in lib.get("files", [])]),
            ])
            search_space = norm_ws(search_space).lower()
            match = pattern in search_space
        if match:
            results.append(lib)
            if limit is not None and len(results) >= limit:
                break
    render_search(results)
    sys.exit(0)

if cmd == "info":
    lib = find_lib(lib_id)
    if lib is None:
        sys.exit(5)
    render_info(lib)
    sys.exit(0)

if cmd == "path":
    lib = find_lib(lib_id)
    if lib is None:
        sys.exit(5)
    install_dir = ""
    if base_dir_effective:
        install_dir = f"{base_dir_effective}/{lib.get('suffixDir')}"
    if json_flag:
        json.dump({
            "id": lib.get("id"),
            "installDir": install_dir,
            "files": [f"{install_dir}/{f.get('path')}" for f in lib.get("files", [])],
        }, sys.stdout)
    else:
        print(install_dir)
        for f in lib.get("files", []):
            print(f"{install_dir}/{f.get('path')}")
    sys.exit(0)

if cmd == "sample":
    lib = find_lib(lib_id)
    if lib is None:
        sys.exit(5)
    print(lib.get("sampleCode", ""))
    sys.exit(0)

if cmd == "install-data":
    lib = find_lib(lib_id)
    if lib is None:
        sys.exit(5)
    print(f"BASE_DIR\t{root_base_dir}")
    print(f"SUFFIX_DIR\t{lib.get('suffixDir')}")
    print(f"VERSION\t{lib.get('version')}")
    for f in lib.get("files", []):
        print(f"FILE\t{f.get('path')}\t{f.get('url')}")
    sys.exit(0)

die("unknown command", 2)
PY
}

resolve_base_dir() {
  local override="$1"
  if [ -n "$override" ]; then
    normalize_base_dir "$override"
    return 0
  fi
  if [ -n "$base_dir_override" ]; then
    normalize_base_dir "$base_dir_override"
    return 0
  fi
  if [ -n "${CWGET_BASE_DIR:-}" ]; then
    normalize_base_dir "$CWGET_BASE_DIR"
    return 0
  fi
  local root_dir
  if ! root_dir="$(python_catalog root-base-dir)"; then
    die "failed to read baseDir from catalog" "$EXIT_CACHE"
  fi
  normalize_base_dir "$root_dir"
}

validate_rel_path() {
  local path="$1"
  if [ -z "$path" ]; then
    return 1
  fi
  case "$path" in
    /*) return 1 ;;
    ../*|*/../*|*/..|..) return 1 ;;
  esac
  return 0
}

ensure_catalog() {
  local now
  local xml_mtime
  local cache_age
  local ttl_seconds
  local stale=0

  if [ ! -f "$CACHE_XML" ]; then
    stale=1
  else
    xml_mtime="$(file_mtime "$CACHE_XML")"
    if [ -n "$xml_mtime" ]; then
      now="$(date +%s)"
      cache_age=$((now - xml_mtime))
      if [ "$cache_age" -lt 0 ]; then
        cache_age=0
      fi
      if [ "$cache_age" -gt "$CACHE_TTL_SECONDS" ]; then
        stale=1
      fi
    else
      stale=1
    fi
  fi

  if [ "$refresh" -eq 1 ]; then
    stale=1
  fi

  if [ "$stale" -eq 1 ]; then
    if [ "$offline" -eq 1 ]; then
      if [ ! -f "$CACHE_XML" ]; then
        die "offline mode and cache missing" "$EXIT_CACHE"
      fi
      warn "cache is stale; using cached catalog due to --offline"
    else
      refresh_catalog
    fi
  else
    vlog "using cached catalog"
  fi
}

refresh_catalog() {
  local lock_dir="${CACHE_DIR}/.lock"
  local tmp_html="${CACHE_HTML}.tmp.$$"
  local tmp_xml="${CACHE_XML}.tmp.$$"
  local meta_tmp="${CACHE_META}.tmp.$$"
  local now

  if ! acquire_lock "$lock_dir"; then
    warn "could not acquire cache lock; proceeding without lock"
  fi

  if [ "$offline" -eq 1 ]; then
    release_lock "$lock_dir"
    die "offline mode forbids refresh" "$EXIT_NETWORK"
  fi

  vlog "refreshing catalog from $SOURCE_URL"
  if ! fetch_url "$SOURCE_URL" "$tmp_html"; then
    release_lock "$lock_dir"
    rm -f "$tmp_html"
    die "failed to download catalog; install wget or curl" "$EXIT_NETWORK"
  fi

  if ! extract_xml "$tmp_html" "$tmp_xml"; then
    release_lock "$lock_dir"
    rm -f "$tmp_html" "$tmp_xml"
    die "failed to extract catalog XML" "$EXIT_CACHE"
  fi

  if [ ! -s "$tmp_xml" ]; then
    release_lock "$lock_dir"
    rm -f "$tmp_html" "$tmp_xml"
    die "extracted XML is empty" "$EXIT_CACHE"
  fi

  mv -f "$tmp_html" "$CACHE_HTML"
  mv -f "$tmp_xml" "$CACHE_XML"

  now="$(date +%s)"
  {
    printf 'fetched_at=%s\n' "$now"
    printf 'source_url=%s\n' "$SOURCE_URL"
    printf 'etag=\n'
    printf 'last_modified=\n'
  } > "$meta_tmp"
  mv -f "$meta_tmp" "$CACHE_META"

  release_lock "$lock_dir"
}

cmd_help() {
  print_usage
  exit 0
}

cmd_update() {
  require_python
  ensure_catalog
  local count
  local xml_mtime
  local now
  local age

  count="$(python_catalog count)"
  xml_mtime="$(file_mtime "$CACHE_XML")"
  now="$(date +%s)"
  age=$((now - xml_mtime))
  if [ "$age" -lt 0 ]; then
    age=0
  fi
  log "source: $SOURCE_URL"
  log "libraries: $count"
  log "cache_age_seconds: $age"
}

cmd_search() {
  local query="$1"
  shift
  local tag=""
  local limit=""

  if [ -z "$query" ]; then
    die "search requires <query>" "$EXIT_USAGE"
  fi

  while [ "$#" -gt 0 ]; do
    case "$1" in
      --tag)
        tag="$2"
        shift 2
        ;;
      --limit)
        limit="$2"
        shift 2
        ;;
      --liked)
        shift
        ;;
      *)
        die "unknown search option: $1" "$EXIT_USAGE"
        ;;
    esac
  done

  require_python
  ensure_catalog
  CWGET_QUERY="$query" CWGET_TAG="$tag" CWGET_LIMIT="$limit" CWGET_JSON="$json_output" \
    python_catalog search
}

cmd_list() {
  local limit=""
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --limit)
        limit="$2"
        shift 2
        ;;
      *)
        die "unknown list option: $1" "$EXIT_USAGE"
        ;;
    esac
  done

  require_python
  ensure_catalog
  CWGET_LIMIT="$limit" CWGET_JSON="$json_output" python_catalog list
}

cmd_info() {
  local id="$1"
  if [ -z "$id" ]; then
    die "info requires <id>" "$EXIT_USAGE"
  fi
  require_python
  ensure_catalog
  local base_dir
  base_dir="$(resolve_base_dir "")"
  CWGET_ID="$id" CWGET_JSON="$json_output" CWGET_BASE_DIR_EFFECTIVE="$base_dir" \
    python_catalog info || {
      local status=$?
      if [ "$status" -eq "$EXIT_NOT_FOUND" ]; then
        die "package not found: $id" "$EXIT_NOT_FOUND"
      fi
      exit "$status"
    }
}

cmd_path() {
  local id="$1"
  if [ -z "$id" ]; then
    die "path requires <id>" "$EXIT_USAGE"
  fi
  require_python
  ensure_catalog
  local base_dir
  base_dir="$(resolve_base_dir "")"
  CWGET_ID="$id" CWGET_JSON="$json_output" CWGET_BASE_DIR_EFFECTIVE="$base_dir" \
    python_catalog path || {
      local status=$?
      if [ "$status" -eq "$EXIT_NOT_FOUND" ]; then
        die "package not found: $id" "$EXIT_NOT_FOUND"
      fi
      exit "$status"
    }
}

cmd_sample() {
  local id="$1"
  if [ -z "$id" ]; then
    die "sample requires <id>" "$EXIT_USAGE"
  fi
  require_python
  ensure_catalog
  CWGET_ID="$id" python_catalog sample || {
    local status=$?
    if [ "$status" -eq "$EXIT_NOT_FOUND" ]; then
      die "package not found: $id" "$EXIT_NOT_FOUND"
    fi
    exit "$status"
  }
}

cmd_install() {
  local id=""
  local dir_override=""
  local dry_run=0
  local force=0
  local print_command=0

  while [ "$#" -gt 0 ]; do
    case "$1" in
      --dir)
        dir_override="$2"
        shift 2
        ;;
      --dry-run)
        dry_run=1
        shift
        ;;
      --force)
        force=1
        shift
        ;;
      --print-command)
        print_command=1
        shift
        ;;
      --help)
        die "usage: $SCRIPT_NAME install <id> [--dir <path>] [--dry-run] [--force] [--print-command]" "$EXIT_USAGE"
        ;;
      -*)
        die "unknown install option: $1" "$EXIT_USAGE"
        ;;
      *)
        if [ -z "$id" ]; then
          id="$1"
          shift
        else
          die "unexpected argument: $1" "$EXIT_USAGE"
        fi
        ;;
    esac
  done

  if [ -z "$id" ]; then
    die "install requires <id>" "$EXIT_USAGE"
  fi

  require_python
  ensure_catalog

  if [ "$offline" -eq 1 ] && [ "$dry_run" -eq 0 ] && [ "$print_command" -eq 0 ]; then
    die "offline mode forbids downloads" "$EXIT_NETWORK"
  fi

  if ! select_fetcher >/dev/null; then
    if [ "$dry_run" -eq 1 ] || [ "$print_command" -eq 1 ]; then
      warn "wget or curl not found; using curl in printed commands"
    else
      die "wget or curl is required for install" "$EXIT_NETWORK"
    fi
  fi

  local data
  if ! data="$(CWGET_ID="$id" python_catalog install-data)"; then
    local status=$?
    if [ "$status" -eq "$EXIT_NOT_FOUND" ]; then
      die "package not found: $id" "$EXIT_NOT_FOUND"
    fi
    exit "$status"
  fi

  local root_base_dir=""
  local suffix_dir=""
  local version=""
  local files=()

  while IFS=$'\t' read -r kind val extra; do
    case "$kind" in
      BASE_DIR)
        root_base_dir="$val"
        ;;
      SUFFIX_DIR)
        suffix_dir="$val"
        ;;
      VERSION)
        version="$val"
        ;;
      FILE)
        files+=("$val"$'\t'"$extra")
        ;;
    esac
  done <<<"$data"

  if [ -z "$suffix_dir" ]; then
    die "catalog entry missing suffixDir for $id" "$EXIT_CACHE"
  fi
  if [ "${#files[@]}" -eq 0 ]; then
    die "catalog entry missing files for $id" "$EXIT_CACHE"
  fi

  local base_dir=""
  if [ -n "$dir_override" ]; then
    base_dir="$(normalize_base_dir "$dir_override")"
  elif [ -n "$base_dir_override" ]; then
    base_dir="$(normalize_base_dir "$base_dir_override")"
  elif [ -n "${CWGET_BASE_DIR:-}" ]; then
    base_dir="$(normalize_base_dir "$CWGET_BASE_DIR")"
  else
    base_dir="$(normalize_base_dir "$root_base_dir")"
  fi

  if [ -z "$base_dir" ]; then
    die "base directory resolved to empty string" "$EXIT_USAGE"
  fi

  if ! validate_rel_path "$suffix_dir"; then
    die "invalid suffixDir in catalog: $suffix_dir" "$EXIT_CACHE"
  fi

  local install_dir="${base_dir}/${suffix_dir}"
  local file_entry
  local rel_path
  local url
  local target
  local target_dir
  local conflict=0

  for file_entry in "${files[@]}"; do
    IFS=$'\t' read -r rel_path url <<<"$file_entry"
    if ! validate_rel_path "$rel_path"; then
      die "invalid file path in catalog: $rel_path" "$EXIT_CACHE"
    fi
    target="${install_dir}/${rel_path}"
    if [ -e "$target" ] && [ "$force" -eq 0 ]; then
      conflict=1
    fi
  done

  if [ "$conflict" -eq 1 ] && [ "$force" -eq 0 ]; then
    die "install conflict: files already exist (use --force to overwrite)" "$EXIT_CONFLICT"
  fi

  if [ "$dry_run" -eq 1 ]; then
    log "dry-run: install $id v${version} into $install_dir"
  else
    vlog "installing $id v${version} into $install_dir"
  fi

  if [ "$print_command" -eq 1 ]; then
    log "print-command:"
  fi

  for file_entry in "${files[@]}"; do
    IFS=$'\t' read -r rel_path url <<<"$file_entry"
    target="${install_dir}/${rel_path}"
    target_dir="$(dirname "$target")"
    if [ "$print_command" -eq 1 ]; then
      log "mkdir -p \"$target_dir\""
      if have_cmd wget; then
        log "wget -O \"$target\" \"$url\""
      else
        log "curl -fL -o \"$target\" \"$url\""
      fi
    fi
    if [ "$dry_run" -eq 1 ]; then
      log "would download $url -> $target"
      continue
    fi
    if ! mkdir -p "$target_dir"; then
      die "failed to create directory: $target_dir" "$EXIT_CACHE"
    fi
    if [ -e "$target" ] && [ "$force" -eq 0 ]; then
      die "install conflict: $target exists" "$EXIT_CONFLICT"
    fi
    vlog "downloading $url"
    if ! download_file "$url" "$target"; then
      die "download failed for $url" "$EXIT_NETWORK"
    fi
  done

  if [ "$dry_run" -eq 0 ]; then
    log "installed $id into $install_dir"
  fi
}

main() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --base-dir)
        base_dir_override="$2"
        shift 2
        ;;
      --cache-ttl)
        cache_ttl_override="$2"
        shift 2
        ;;
      --cache-dir)
        cache_dir_override="$2"
        shift 2
        ;;
      --source-url)
        source_url_override="$2"
        shift 2
        ;;
      --refresh)
        refresh=1
        shift
        ;;
      --offline)
        offline=1
        shift
        ;;
      --json)
        json_output=1
        shift
        ;;
      --quiet)
        quiet=1
        shift
        ;;
      --verbose)
        verbose=1
        shift
        ;;
      --help)
        cmd_help
        ;;
      --)
        shift
        break
        ;;
      -*)
        die "unknown option: $1" "$EXIT_USAGE"
        ;;
      *)
        break
        ;;
    esac
  done

  if [ "$quiet" -eq 1 ] && [ "$verbose" -eq 1 ]; then
    verbose=0
  fi

  local ttl_input="${cache_ttl_override:-${CWGET_CACHE_TTL:-$DEFAULT_CACHE_TTL}}"
  CACHE_TTL_SECONDS="$(parse_ttl "$ttl_input")" || die "invalid cache ttl: $ttl_input" "$EXIT_USAGE"

  SOURCE_URL="${source_url_override:-${CWGET_SOURCE_URL:-$DEFAULT_SOURCE_URL}}"
  CACHE_DIR="$(resolve_cache_dir)"
  CACHE_HTML="${CACHE_DIR}/catalog.html"
  CACHE_XML="${CACHE_DIR}/catalog.xml"
  CACHE_META="${CACHE_DIR}/meta"

  local cmd="${1:-}"
  if [ -z "$cmd" ]; then
    cmd_help
  fi
  shift || true

  case "$cmd" in
    help)
      cmd_help
      ;;
    update)
      cmd_update
      ;;
    search)
      cmd_search "$@"
      ;;
    info)
      cmd_info "$@"
      ;;
    install)
      cmd_install "$@"
      ;;
    list)
      cmd_list "$@"
      ;;
    path)
      cmd_path "$@"
      ;;
    sample)
      cmd_sample "$@"
      ;;
    *)
      die "unknown command: $cmd" "$EXIT_USAGE"
      ;;
  esac
}

main "$@"

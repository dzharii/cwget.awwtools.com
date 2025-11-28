(function () {
  "use strict";

  const LOG_PREFIX = "[wget-pm]";
  const STORAGE_KEYS = {
    baseDir: "cwget.baseDir",
    theme: "cwget.theme",
  };

  const selectors = {
    baseDirInput: document.getElementById("baseDirInput"),
    baseDirOverride: document.getElementById("baseDirOverride"),
    themeOverride: document.getElementById("themeOverride"),
    themeSelect: document.getElementById("themeSelect"),
    resetButton: document.getElementById("resetSettings"),
    searchInput: document.getElementById("searchInput"),
    filterHint: document.getElementById("filterHint"),
    tocList: document.getElementById("tocList"),
    messages: document.getElementById("messages"),
    libraryContainer: document.getElementById("libraryContainer"),
  };

  const state = {
    baseDirDefault: "external",
    settings: {
      baseDir: "external",
      theme: "system",
    },
    libraries: [],
    filterQuery: "",
    hashTarget: decodeURIComponent(window.location.hash || "").replace("#", ""),
    libraryLookup: {},
    shellSelections: {},
  };

  let toastEl = null;
  let toastTimer = null;

  function log(action, payload) {
    if (payload !== undefined) {
      console.log(`${LOG_PREFIX} ${action}`, payload);
    } else {
      console.log(`${LOG_PREFIX} ${action}`);
    }
  }

  function logError(action, error) {
    console.error(`${LOG_PREFIX} ${action}`, error);
  }

  function setMessage(text, level = "info") {
    if (!selectors.messages) return;
    selectors.messages.textContent = text || "";
    selectors.messages.className = level ? `message ${level}` : "message";
  }

  function showToast(message) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.id = "toast";
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    toastEl.classList.add("visible");
    if (toastTimer) {
      clearTimeout(toastTimer);
    }
    toastTimer = setTimeout(() => {
      toastEl.classList.remove("visible");
    }, 1800);
  }

  function escapeQuotes(value, platform) {
    if (platform === "powershell") {
      return value.replace(/"/g, '""');
    }
    return value.replace(/"/g, '\\"');
  }

  function quote(value, platform) {
    return `"${escapeQuotes(value, platform)}"`;
  }

  function normalizeBaseDir(input, fallback) {
    const trimmed = (input || "").trim();
    if (!trimmed) return fallback;
    return trimmed.replace(/\\/g, "/").replace(/\/+$/g, "");
  }

  function buildInstallDirs(baseDir, suffixDir) {
    const cleanBase = normalizeBaseDir(baseDir, "external");
    const cleanSuffix = (suffixDir || "").trim().replace(/\/+$/g, "");
    const combined = cleanSuffix ? `${cleanBase}/${cleanSuffix}` : cleanBase;
    return {
      posix: combined,
      win: combined, // PowerShell accepts forward slashes; keep paths consistent
    };
  }

  function ensureContent(value, name, id) {
    if (!value) {
      throw new Error(`Missing required field "${name}" for library "${id}"`);
    }
  }

  function parseTags(text) {
    return (text || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }

  function formatDisplayUrl(url) {
    try {
      const parsed = new URL(url);
      const cleanedPath = parsed.pathname.replace(/\/$/, "");
      return `${parsed.hostname}${cleanedPath}`;
    } catch (error) {
      logError("url format failed", error);
      return url;
    }
  }

  function getShellForLibrary(libId) {
    return state.shellSelections[libId] || "bash";
  }

  function setShellForLibrary(libId, shell) {
    state.shellSelections[libId] = shell === "powershell" ? "powershell" : "bash";
  }

  function makeLibTitle(lib) {
    const pathLabel = lib.suffixDir ? `${lib.suffixDir}/${lib.fsName}` : lib.fsName;
    return { pathLabel, fullTitle: `${pathLabel} — ${lib.title}` };
  }

  function parseFiles(node, id) {
    const filesParent = node.querySelector("files");
    const fileNodes = filesParent ? Array.from(filesParent.querySelectorAll("file")) : [];

    if (fileNodes.length > 0) {
      return fileNodes.map((fileNode, index) => {
        const path = (fileNode.getAttribute("path") || fileNode.textContent || "").trim();
        ensureContent(path, `files[${index}].path`, id);

        const inlineUrl = (fileNode.getAttribute("url") || fileNode.getAttribute("href") || "").trim();
        const nestedUrl = ((fileNode.querySelector("url") || {}).textContent || "").trim();
        const url = inlineUrl || nestedUrl;
        ensureContent(url, `files[${index}].url`, id);

        return { path, url };
      });
    }

    // Legacy support: single <file> and <url> entries.
    const legacyPath = ((node.querySelector("file") || {}).textContent || "").trim();
    const legacyUrl = ((node.querySelector("url") || {}).textContent || "").trim();
    ensureContent(legacyPath, "file", id);
    ensureContent(legacyUrl, "url", id);
    return [{ path: legacyPath, url: legacyUrl }];
  }

  function parseDocumentation(node, id) {
    const docsRoot = node.querySelector("documentation");
    if (!docsRoot) {
      throw new Error(`Missing documentation block for library "${id}"`);
    }

    const links = Array.from(docsRoot.querySelectorAll("link")).map((linkNode, index) => {
      const url = ((linkNode.querySelector("url") || {}).textContent || linkNode.getAttribute("href") || "").trim();
      ensureContent(url, `documentation[${index}].url`, id);

      const urlDescription = ((linkNode.querySelector("urlDescription") || {}).textContent || "").trim();
      ensureContent(urlDescription, `documentation[${index}].urlDescription`, id);

      return { url, label: urlDescription };
    });

    if (links.length === 0) {
      throw new Error(`Missing documentation links for library "${id}"`);
    }

    return links;
  }

  function readXml() {
    const xmlScript = document.getElementById("library-xml");
    if (!xmlScript) {
      throw new Error("Missing XML data block with id library-xml");
    }
    const xmlText = xmlScript.textContent || "";
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "application/xml");
    const parserError = xmlDoc.getElementsByTagName("parsererror")[0];
    if (parserError) {
      throw new Error(`XML parse error: ${parserError.textContent || "unknown error"}`);
    }
    const root = xmlDoc.querySelector("libraries");
    if (!root) {
      throw new Error("XML is missing the <libraries> root element");
    }

    const baseDir = root.getAttribute("baseDir") || "external";
    const defaultVersion = root.getAttribute("defaultVersion") || "0.0.0";

    const libraries = [];
    const items = root.querySelectorAll("library");

    items.forEach((node) => {
      const id = node.getAttribute("id") || "";
      ensureContent(id, "id", id || "unknown");

      const fsName = node.getAttribute("fsName") || id;
      const files = parseFiles(node, id);

      const suffixDir = ((node.querySelector("suffixDir") || {}).textContent || "").trim();
      ensureContent(suffixDir, "suffixDir", id);

      const version = ((node.querySelector("version") || {}).textContent || "").trim() || defaultVersion;
      const title = ((node.querySelector("title") || {}).textContent || "").trim() || fsName;
      const description = ((node.querySelector("description") || {}).textContent || "").trim();
      ensureContent(description, "description", id);

      const categoriesRaw = ((node.querySelector("categories") || {}).textContent || "").trim();
      const categories = parseTags(categoriesRaw);
      ensureContent(categoriesRaw, "categories", id);

      const sampleCode = ((node.querySelector("sampleCode") || {}).textContent || "").trim();
      ensureContent(sampleCode, "sampleCode", id);

      const licenseSummary = ((node.querySelector("licenseSummary") || {}).textContent || "").trim();
      ensureContent(licenseSummary, "licenseSummary", id);
      const licenseUrl = ((node.querySelector("licenseUrl") || {}).textContent || "").trim();
      ensureContent(licenseUrl, "licenseUrl", id);

      const worksWellWithRaw = ((node.querySelector("worksWellWith") || {}).textContent || "").trim();
      const worksWellWith = worksWellWithRaw
        ? worksWellWithRaw
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
            .slice(0, 7)
        : [];

      const documentation = parseDocumentation(node, id);
      const testFile = `test_${fsName}_main.c`;

      libraries.push({
        id,
        fsName,
        files,
        suffixDir,
        version,
        title,
        description,
        categories,
        sampleCode,
        licenseSummary,
        licenseUrl,
        worksWellWith,
        documentation,
        testFile,
      });
    });

    log("xml parsed", { libraries: libraries.length, baseDir });
    return { baseDir, defaultVersion, libraries };
  }

  function loadSettings(baseDirDefault) {
    const storedBaseDir = localStorage.getItem(STORAGE_KEYS.baseDir);
    const storedTheme = localStorage.getItem(STORAGE_KEYS.theme);

    state.baseDirDefault = baseDirDefault;
    state.settings.baseDir = normalizeBaseDir(storedBaseDir, baseDirDefault);
    state.settings.theme = storedTheme === "light" || storedTheme === "dark" ? storedTheme : "system";

    selectors.baseDirInput.value = state.settings.baseDir;
    selectors.themeSelect.value = state.settings.theme;
    updateOverrideIndicators();
    applyTheme(state.settings.theme);
  }

  function saveSetting(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      logError("localStorage.setItem failed", error);
    }
  }

  function applyTheme(theme) {
    document.body.classList.remove("theme-system", "theme-light", "theme-dark");
    const themeClass = theme === "light" || theme === "dark" ? `theme-${theme}` : "theme-system";
    document.body.classList.add(themeClass);
    log("theme applied", themeClass);
  }

  function updateOverrideIndicators() {
    const baseOverride = state.settings.baseDir !== normalizeBaseDir(state.baseDirDefault, "external");
    if (selectors.baseDirOverride) {
      selectors.baseDirOverride.classList.toggle("visible", baseOverride);
    }

    const themeOverride = state.settings.theme !== "system";
    if (selectors.themeOverride) {
      selectors.themeOverride.classList.toggle("visible", themeOverride);
    }
  }

  function computeRenderData(lib) {
    const dirs = buildInstallDirs(state.settings.baseDir, lib.suffixDir);
    const posixLibraryPaths = lib.files.map((file) => `${dirs.posix}/${file.path}`);
    const winLibraryPaths = lib.files.map((file) => `${dirs.win}/${file.path}`);
    const posixTestPath = `${dirs.posix}/${lib.testFile}`;
    const winTestPath = `${dirs.win}/${lib.testFile}`;
    const posixExePath = `${dirs.posix}/${lib.fsName}_example`;
    const winExePath = `${dirs.win}/${lib.fsName}_example.exe`;

    const dirPosixQ = quote(dirs.posix, "posix");
    const dirWinQ = quote(dirs.win, "powershell");
    const posixUrls = lib.files.map((file) => quote(file.url, "posix"));
    const winUrls = lib.files.map((file) => quote(file.url, "powershell"));
    const libPosixQ = posixLibraryPaths.map((path) => quote(path, "posix"));
    const libWinQ = winLibraryPaths.map((path) => quote(path, "powershell"));
    const testPosixQ = quote(posixTestPath, "posix");
    const testWinQ = quote(winTestPath, "powershell");
    const exePosixQ = quote(posixExePath, "posix");
    const exeWinQ = quote(winExePath, "powershell");

    const wgetPosixParts = lib.files.map((_, index) => `wget -O ${libPosixQ[index]} ${posixUrls[index]}`);
    const curlPosixParts = lib.files.map((_, index) => `curl -L ${posixUrls[index]} -o ${libPosixQ[index]}`);
    const wgetPosix = ["mkdir -p " + dirPosixQ, ...wgetPosixParts].join(" && ");
    const curlPosix = ["mkdir -p " + dirPosixQ, ...curlPosixParts].join(" && ");

    const curlPwshParts = lib.files.map((_, index) => `curl ${winUrls[index]} -OutFile ${libWinQ[index]}`);
    const wgetPwshParts = lib.files.map((_, index) => `wget ${winUrls[index]} -OutFile ${libWinQ[index]}`);
    const iwrPwshParts = lib.files.map((_, index) => `Invoke-WebRequest ${winUrls[index]} -OutFile ${libWinQ[index]}`);
    const mkdirPwsh = `New-Item -ItemType Directory -Path ${dirWinQ} -Force | Out-Null`;
    const curlPwsh = [mkdirPwsh, ...curlPwshParts].join("; ");
    const wgetPwsh = [mkdirPwsh, ...wgetPwshParts].join("; ");
    const iwrPwsh = [mkdirPwsh, ...iwrPwshParts].join("; ");

    const posixSourceArgs = lib.files
      .map((file, index) => ({ file, path: libPosixQ[index] }))
      .filter((entry) => entry.file.path.toLowerCase().endsWith(".c"))
      .map((entry) => entry.path)
      .join(" ");
    const winSourceArgs = lib.files
      .map((file, index) => ({ file, path: libWinQ[index] }))
      .filter((entry) => entry.file.path.toLowerCase().endsWith(".c"))
      .map((entry) => entry.path)
      .join(" ");

    const compilePosix = `cc -Wall -Wextra -I${dirPosixQ} ${testPosixQ}` + (posixSourceArgs ? ` ${posixSourceArgs}` : "") + ` -o ${exePosixQ}`;
    const compileWin = `cl /W4 /I${dirWinQ} ${testWinQ}` + (winSourceArgs ? ` ${winSourceArgs}` : "") + ` /Fe${exeWinQ}`;

    const posixScript = [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      `BASE_DIR=${dirPosixQ}`,
      `TEST_PATH=${testPosixQ}`,
      "",
      "mkdir -p \"$BASE_DIR\"",
      "echo \"Downloading library files...\"",
      ...lib.files.map((file, index) => `curl -L ${posixUrls[index]} -o ${libPosixQ[index]}`),
      "echo \"Writing sample program...\"",
      "cat > \"$TEST_PATH\" <<'CWGET_SAMPLE_END'",
      lib.sampleCode.trim(),
      "CWGET_SAMPLE_END",
      "echo \"Compiling sample...\"",
      compilePosix,
      'echo "Done."',
      "",
    ].join("\n");

    const psScriptLines = [
      "# PowerShell install and build script generated by cwget",
      `$BaseDir = ${dirWinQ}`,
      `$TestPath = ${testWinQ}`,
      "",
      'New-Item -ItemType Directory -Force -Path $BaseDir | Out-Null',
      'Write-Host "Downloading library files..."',
      ...lib.files.map((file, index) => `Invoke-WebRequest -Uri ${winUrls[index]} -OutFile ${libWinQ[index]}`),
      'Write-Host "Writing sample program..."',
      '@"',
      lib.sampleCode.trim(),
      '"@ | Set-Content -Path $TestPath',
      'Write-Host "Compiling sample..."',
      compileWin,
      'Write-Host "Done."',
      "",
    ];

    return {
      dirs,
      paths: {
        posixLibraryPaths,
        winLibraryPaths,
        posixTestPath,
        winTestPath,
        posixExePath,
        winExePath,
      },
      commands: {
        wgetPosix,
        curlPosix,
        curlPwsh,
        wgetPwsh,
        iwrPwsh,
        compilePosix,
        compileWin,
      },
      scripts: {
        posix: posixScript,
        powershell: psScriptLines.join("\n"),
      },
    };
  }

  function applyFilters() {
    const query = state.filterQuery.trim().toLowerCase();
    state.filtered = state.libraries.filter((lib) => {
      if (!query) return true;
      const haystack = [
        lib.title,
        lib.description,
        lib.categories.join(" "),
        lib.files.map((file) => file.path).join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
    updateFilterHint();
    log("filter applied", { query, count: state.filtered.length });
  }

  function updateFilterHint() {
    if (!selectors.filterHint) return;
    if (!state.filterQuery.trim()) {
      selectors.filterHint.textContent = "Showing all libraries";
      return;
    }
    selectors.filterHint.textContent = `Filtered to ${state.filtered.length} of ${state.libraries.length} with "${state.filterQuery.trim()}"`;
  }

  function createTagElement(tag) {
    const tagEl = document.createElement("button");
    tagEl.type = "button";
    tagEl.className = "tag";
    tagEl.textContent = tag;
    tagEl.setAttribute("data-tag", tag);
    tagEl.title = `Filter by ${tag}`;
    return tagEl;
  }

  function createCopyButton(text) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "copy-button";
    button.textContent = "Copy";
    button.setAttribute("data-clipboard-text", text);
    return button;
  }

  function createCodeBlock(label, text, shell) {
    const wrapper = document.createElement("div");
    wrapper.className = "code-block";
    if (shell) {
      wrapper.dataset.shell = shell;
    }

    const header = document.createElement("div");
    header.className = "code-block-header";
    const labelEl = document.createElement("span");
    labelEl.className = "code-block-label";
    labelEl.textContent = label;
    const copyBtn = createCopyButton(text);
    header.appendChild(labelEl);
    header.appendChild(copyBtn);

    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.textContent = text;
    pre.appendChild(code);

    wrapper.appendChild(header);
    wrapper.appendChild(pre);
    return wrapper;
  }

  function createDocumentationSection(links) {
    if (!links || links.length === 0) return null;

    const section = document.createElement("div");
    section.className = "documentation";

    const title = document.createElement("h3");
    title.textContent = "Documentation";
    section.appendChild(title);

    const list = document.createElement("div");
    list.className = "documentation-list";

    links.forEach((link) => {
      const item = document.createElement("a");
      item.className = "doc-card";
      item.href = link.url;
      item.target = "_blank";
      item.rel = "noopener noreferrer";

      const label = document.createElement("div");
      label.className = "doc-label";
      label.textContent = link.label;

      const urlText = document.createElement("div");
      urlText.className = "doc-url";
      urlText.textContent = formatDisplayUrl(link.url);

      item.appendChild(label);
      item.appendChild(urlText);
      list.appendChild(item);
    });

    section.appendChild(list);
    return section;
  }

  function applyShellVisibility(section, shell) {
    section.querySelectorAll(".command-set").forEach((node) => {
      const shouldShow = (node.dataset.shell || "") === shell;
      node.classList.toggle("inactive", !shouldShow);
    });
    section.querySelectorAll(".code-block").forEach((node) => {
      const nodeShell = node.dataset.shell;
      if (nodeShell) {
        node.classList.toggle("inactive", nodeShell !== shell);
      }
    });
  }

  function createShellToggle(libId, shell, onChange) {
    const wrapper = document.createElement("div");
    wrapper.className = "shell-toggle";

    const label = document.createElement("span");
    label.className = "shell-label";
    label.textContent = "Shell";
    wrapper.appendChild(label);

    const tabs = document.createElement("div");
    tabs.className = "shell-tabs";
    const shells = [
      { value: "bash", title: "Bash" },
      { value: "powershell", title: "PowerShell" },
    ];

    shells.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "shell-tab";
      button.textContent = item.title;
      button.dataset.shell = item.value;
      if (item.value === shell) {
        button.classList.add("active");
      }
      button.addEventListener("click", () => {
        const chosen = button.dataset.shell || "bash";
        setShellForLibrary(libId, chosen);
        tabs.querySelectorAll(".shell-tab").forEach((tab) => {
          tab.classList.toggle("active", tab === button);
        });
        if (onChange) {
          onChange(chosen);
        }
      });
      tabs.appendChild(button);
    });

    wrapper.appendChild(tabs);
    return wrapper;
  }

  function createToggle(label, contentEl, expanded) {
    const wrapper = document.createElement("div");
    wrapper.className = "toggle";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "toggle-button";
    button.textContent = expanded ? `Hide ${label}` : `Show ${label}`;
    button.setAttribute("aria-expanded", expanded ? "true" : "false");

    const content = document.createElement("div");
    content.className = "toggle-content";
    if (!expanded) {
      content.hidden = true;
    }
    content.appendChild(contentEl);

    button.addEventListener("click", () => {
      const isHidden = content.hidden;
      content.hidden = !isHidden;
      button.textContent = (!isHidden ? `Show ${label}` : `Hide ${label}`);
      button.setAttribute("aria-expanded", isHidden ? "true" : "false");
      log("toggle", { label, expanded: !isHidden });
    });

    wrapper.appendChild(button);
    wrapper.appendChild(content);
    return wrapper;
  }

  function renderLibraries() {
    selectors.libraryContainer.innerHTML = "";
    const fragment = document.createDocumentFragment();

    state.filtered.forEach((lib) => {
      const renderData = computeRenderData(lib);
      const shell = getShellForLibrary(lib.id);
      const titleParts = makeLibTitle(lib);
      const section = document.createElement("section");
      section.className = "library";
      section.id = lib.id;

      const header = document.createElement("div");
      header.className = "library-header";

      const title = document.createElement("h2");
      title.textContent = titleParts.pathLabel;

      const version = document.createElement("span");
      version.className = "version";
      version.textContent = `v${lib.version}`;
      title.appendChild(version);

      const installPath = document.createElement("div");
      installPath.className = "install-path";
      installPath.textContent = `Install directory: ${renderData.dirs.posix}`;

      const fileList = document.createElement("div");
      fileList.className = "file-list";
      fileList.textContent = `Files: ${lib.files.map((file) => file.path).join(", ")}`;

      const tagsRow = document.createElement("div");
      tagsRow.className = "tag-row";
      lib.categories.forEach((tag) => {
        tagsRow.appendChild(createTagElement(tag));
      });

      header.appendChild(title);
      header.appendChild(installPath);
      header.appendChild(fileList);
      header.appendChild(tagsRow);

      const description = document.createElement("p");
      description.className = "description";
      description.textContent = lib.description;

      const license = document.createElement("div");
      license.className = "license";
      const licenseLink = document.createElement("a");
      licenseLink.href = lib.licenseUrl;
      licenseLink.target = "_blank";
      licenseLink.rel = "noopener noreferrer";
      licenseLink.textContent = lib.licenseSummary;
      license.innerHTML = "License: ";
      license.appendChild(licenseLink);

      const documentation = createDocumentationSection(lib.documentation);
      const shellToggle = createShellToggle(lib.id, shell, (newShell) => {
        applyShellVisibility(section, newShell);
      });

      const commandsSection = document.createElement("div");
      commandsSection.className = "commands";
      const commandsTitle = document.createElement("h3");
      commandsTitle.textContent = "Download commands";
      commandsSection.appendChild(commandsTitle);

      const posixCommands = document.createElement("div");
      posixCommands.className = "command-set";
      posixCommands.dataset.shell = "bash";
      posixCommands.appendChild(createCodeBlock("Bash wget", renderData.commands.wgetPosix, "bash"));
      posixCommands.appendChild(createCodeBlock("Bash curl", renderData.commands.curlPosix, "bash"));

      const winCommands = document.createElement("div");
      winCommands.className = "command-set";
      winCommands.dataset.shell = "powershell";
      winCommands.appendChild(createCodeBlock("PowerShell curl alias", renderData.commands.curlPwsh, "powershell"));
      winCommands.appendChild(createCodeBlock("PowerShell wget alias", renderData.commands.wgetPwsh, "powershell"));
      winCommands.appendChild(createCodeBlock("Invoke-WebRequest", renderData.commands.iwrPwsh, "powershell"));

      commandsSection.appendChild(posixCommands);
      commandsSection.appendChild(winCommands);

      const compileContent = document.createElement("div");
      compileContent.className = "compile-section";
      compileContent.appendChild(createCodeBlock("Bash compile", renderData.commands.compilePosix, "bash"));
      compileContent.appendChild(createCodeBlock("Windows compile", renderData.commands.compileWin, "powershell"));
      const compileToggle = createToggle("build commands", compileContent, false);

      const scriptsContent = document.createElement("div");
      scriptsContent.className = "scripts";
      scriptsContent.appendChild(createCodeBlock("Bash install script", renderData.scripts.posix, "bash"));
      scriptsContent.appendChild(createCodeBlock("PowerShell install script", renderData.scripts.powershell, "powershell"));
      const scriptToggle = createToggle("install scripts", scriptsContent, false);

      const sampleBlock = createCodeBlock("Sample program", lib.sampleCode.trim(), null);
      const sampleToggle = createToggle("sample program", sampleBlock, false);

      const related = document.createElement("div");
      related.className = "related";
      if (lib.worksWellWith.length > 0) {
        const relatedTitle = document.createElement("h4");
        relatedTitle.textContent = "Works well with";
        related.appendChild(relatedTitle);
        const relatedList = document.createElement("div");
        relatedList.className = "related-list";

        lib.worksWellWith.slice(0, 7).forEach((id) => {
          const match = state.libraryLookup[id];
          if (match) {
            const link = document.createElement("a");
            link.href = `#${match.id}`;
            link.textContent = match.title;
            relatedList.appendChild(link);
          }
        });
        related.appendChild(relatedList);
      }

      section.appendChild(header);
      section.appendChild(description);
      section.appendChild(license);
      if (documentation) {
        section.appendChild(documentation);
      }
      section.appendChild(shellToggle);
      section.appendChild(commandsSection);
      section.appendChild(compileToggle);
      section.appendChild(scriptToggle);
      section.appendChild(sampleToggle);
      if (related.childElementCount > 0) {
        section.appendChild(related);
      }

      fragment.appendChild(section);
      applyShellVisibility(section, shell);
    });

    selectors.libraryContainer.appendChild(fragment);
    attachCopyHandlers();
  }

  function renderToc() {
    selectors.tocList.innerHTML = "";
    const fragment = document.createDocumentFragment();
    state.filtered.forEach((lib) => {
      const li = document.createElement("li");
      const link = document.createElement("a");
      link.href = `#${lib.id}`;
      const titleParts = makeLibTitle(lib);
      link.textContent = titleParts.pathLabel;
      li.appendChild(link);
      fragment.appendChild(li);
    });
    selectors.tocList.appendChild(fragment);
  }

  function attachCopyHandlers() {
    selectors.libraryContainer.querySelectorAll(".copy-button").forEach((btn) => {
      btn.onclick = () => {
        const text = btn.getAttribute("data-clipboard-text") || "";
        copyText(text);
      };
    });
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      log("copy", { length: text.length });
      showToast("Copied");
    } catch (error) {
      logError("copy failed", error);
      showToast("Copy failed");
    }
  }

  function resetSettings() {
    state.settings.baseDir = normalizeBaseDir(state.baseDirDefault, "external");
    state.settings.theme = "system";
    state.shellSelections = {};
    selectors.baseDirInput.value = state.settings.baseDir;
    selectors.themeSelect.value = state.settings.theme;
    Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
    updateOverrideIndicators();
    applyTheme(state.settings.theme);
    applyFilters();
    safeRenderAll();
    log("settings reset");
  }

  function renderAll() {
    renderLibraries();
    renderToc();
    if (state.hashTarget) {
      const target = document.getElementById(state.hashTarget);
      if (target) {
        target.scrollIntoView({ behavior: "smooth" });
      }
      state.hashTarget = "";
    }
  }

  function safeRenderAll() {
    try {
      renderAll();
      setMessage("");
    } catch (error) {
      setMessage("Rendering failed. Check the console for details.", "error");
      logError("render failed", error);
    }
  }

  function bindEvents() {
    selectors.baseDirInput.addEventListener("input", (event) => {
      state.settings.baseDir = normalizeBaseDir(event.target.value, state.baseDirDefault);
      saveSetting(STORAGE_KEYS.baseDir, state.settings.baseDir);
      updateOverrideIndicators();
      applyFilters();
      safeRenderAll();
      log("baseDir changed", state.settings.baseDir);
    });

    selectors.themeSelect.addEventListener("change", (event) => {
      state.settings.theme = event.target.value;
      saveSetting(STORAGE_KEYS.theme, state.settings.theme);
      applyTheme(state.settings.theme);
      updateOverrideIndicators();
      log("theme changed", state.settings.theme);
    });

    selectors.searchInput.addEventListener("input", (event) => {
      state.filterQuery = event.target.value || "";
      applyFilters();
      safeRenderAll();
    });

    selectors.resetButton.addEventListener("click", resetSettings);

    selectors.libraryContainer.addEventListener("click", (event) => {
      const tag = event.target.closest(".tag");
      if (tag) {
        const tagValue = tag.getAttribute("data-tag") || "";
        state.filterQuery = tagValue;
        selectors.searchInput.value = tagValue;
        applyFilters();
        safeRenderAll();
        log("tag filter", tagValue);
      }
    });
  }

  function init() {
    try {
      setMessage("");
      log("init start");
      const parsed = readXml();
      state.baseDirDefault = parsed.baseDir;
      state.libraries = parsed.libraries;
      state.libraryLookup = Object.fromEntries(parsed.libraries.map((lib) => [lib.id, lib]));
      loadSettings(parsed.baseDir);
      bindEvents();
      applyFilters();
      safeRenderAll();
      log("init complete", { libraries: state.libraries.length });
    } catch (error) {
      setMessage("Something went wrong while loading the library data. See console for details.", "error");
      logError("init failed", error);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();

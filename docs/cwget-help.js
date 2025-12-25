(function () {
  "use strict";

  const outputLines = [
    "Usage: cwget.sh [global options] <command> [args]",
    "",
    "Global options:",
    "  --base-dir <path>   Override base install directory",
    "  --cache-ttl <time>  Cache TTL in seconds or minutes (e.g. 1200, 20m)",
    "  --cache-dir <path>  Override cache directory",
    "  --source-url <url>  Override catalog HTML URL",
    "  --refresh           Force refresh of catalog",
    "  --offline           Do not use network; fail if cache missing",
    "  --json              Emit JSON for list/search/info/path",
    "  --quiet             Less output",
    "  --verbose           More output",
    "  --help              Show this help",
    "",
    "Commands:",
    "  help",
    "  update",
    "  search <query> [--tag <tag>] [--limit <n>]",
    "  info <id>",
    "  install <id> [--dir <path>] [--dry-run] [--force] [--print-command]",
    "  list [--limit <n>]",
    "  path <id>",
    "  sample <id>",
  ];

  function randomBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function charDelay(ch) {
    const base = randomBetween(45, 110);
    if (ch === " ") return base + 40;
    if ("/-._".indexOf(ch) !== -1) return base + 25;
    return base;
  }

  function schedule(timers, fn, delay) {
    const timer = setTimeout(fn, delay);
    timers.push(timer);
  }

  function initTerminal(details) {
    const terminal = details.querySelector(".terminal-sim");
    const content = details.querySelector(".terminal-content");
    if (!terminal || !content) return;

    const command = terminal.getAttribute("data-command") || "./cwget.sh help";
    const prompt = "$ ";
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let runId = 0;
    let timers = [];

    function clearTimers() {
      timers.forEach((timer) => clearTimeout(timer));
      timers = [];
    }

    function resetTerminal() {
      runId += 1;
      clearTimers();
      content.textContent = "";
      terminal.classList.remove("is-typing");
    }

    function showAll() {
      content.textContent = `${prompt}${command}\n${outputLines.join("\n")}\n`;
      terminal.classList.remove("is-typing");
    }

    function typeCommand(index, currentRun) {
      if (currentRun !== runId) return;
      if (index >= command.length) {
        content.textContent += "\n";
        schedule(timers, () => showOutput(0, currentRun), randomBetween(320, 520));
        return;
      }
      content.textContent += command[index];
      schedule(timers, () => typeCommand(index + 1, currentRun), charDelay(command[index]));
    }

    function showOutput(index, currentRun) {
      if (currentRun !== runId) return;
      if (index >= outputLines.length) {
        terminal.classList.remove("is-typing");
        return;
      }
      content.textContent += `${outputLines[index]}\n`;
      schedule(timers, () => showOutput(index + 1, currentRun), randomBetween(110, 220));
    }

    function start() {
      resetTerminal();
      if (reduceMotion) {
        showAll();
        return;
      }
      terminal.classList.add("is-typing");
      content.textContent = prompt;
      const currentRun = runId;
      schedule(timers, () => typeCommand(0, currentRun), randomBetween(120, 200));
    }

    details.addEventListener("toggle", () => {
      if (details.open) {
        start();
      } else {
        resetTerminal();
      }
    });

    if (details.open) {
      start();
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const details = document.querySelector(".cli-help-details");
    if (!details) return;
    initTerminal(details);
  });
})();

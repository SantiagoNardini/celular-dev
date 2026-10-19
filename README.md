<div align="center">

# celular-dev

**See your website on a real Android phone, straight from your PC.**<br>
Over USB, live reload, a mirror you can touch, and the phone's errors explained in plain language.

[![Tests](https://github.com/SantiagoNardini/celular-dev/actions/workflows/pruebas.yml/badge.svg)](https://github.com/SantiagoNardini/celular-dev/actions/workflows/pruebas.yml)
[![Release](https://img.shields.io/github/v/release/SantiagoNardini/celular-dev)](https://github.com/SantiagoNardini/celular-dev/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)

[**Download**](https://github.com/SantiagoNardini/celular-dev/releases/latest) · [Español](README.es.md) · [Full manual](celular-dev/README.md)

<img src="docs/img/demo.gif" alt="celular-dev: the phone's screen live in a panel, an error explained in plain language, and a saved CSS change reaching the phone by itself" width="760">

</div>

## Why

Testing a site on a phone usually means a mix of emulators, tunnels, `chrome://inspect` and guessing. celular-dev does the boring part for you:

1. You plug your phone in.
2. You pick a folder (or the dev server you already run).
3. Your site opens in the phone's Chrome, **reloads when you save**, and shows up **live in a panel on your PC** that you can tap, swipe and type into.

When something breaks on the phone, you don't get a stack trace and a shrug: you get *"Your page uses `mostrarRanking`, but it does not exist. Check the spelling, or whether the file that defines it is loaded."*, with the file and line, a button to open it in your editor, and a button that copies it for your AI assistant.

<p align="center">
  <img src="docs/img/panel-dark.png" alt="celular-dev panel, dark theme" width="49%">
  <img src="docs/img/panel-light.png" alt="celular-dev panel, light theme" width="49%">
</p>

## Quick start

**Easiest (nothing to install):** download the package for your system from [Releases](https://github.com/SantiagoNardini/celular-dev/releases/latest) — Windows, Mac (Apple Silicon and Intel) or Linux. Node is included. Unzip and double-click `celular-dev.bat` (Windows), `celular-dev.command` (Mac) or run `./celular-dev.sh` (Linux).

**With Node 22+:**

```bash
npx github:SantiagoNardini/celular-dev
```

On the phone you need **USB debugging** turned on (the panel walks you through it, step by step, with animations) and **Google Chrome**. ADB downloads itself with one click if you don't have it.

**From inside your project** (starts its dev server for you, and stops it when you close):

```bash
npx github:SantiagoNardini/celular-dev --iniciar
```

Without `--iniciar` nothing is started: the panel just offers it, and you choose.

**Try it with the example site** (two buttons that fail on purpose, so you can see the errors explained):

```bash
git clone https://github.com/SantiagoNardini/celular-dev && cd celular-dev
node celular-dev/bin/celular.mjs --carpeta celular-dev/ejemplo
```

## What it does

- **Starts your dev server — only if you ask.** Open celular-dev inside a project (Vite, Next, Astro, Angular…) and the panel offers to run its `npm run dev` for you: *Start the server*, *Always for this project*, *Not now* or *Do not ask again*. It shows the command first, never runs anything on its own, shows the server's output, and stops it when you close celular-dev. From the terminal: `--iniciar`.
- **Live mirror, touchable.** The phone's screen in the panel: tap, swipe, scroll with the mouse wheel and type with your keyboard. A change shows up in about 90 ms, and a sharp full-resolution image arrives when the screen rests.
- **Reload on save.** Works with a plain folder (no server needed) or with the server you already run: Live Server, Vite, `npm run dev`…
- **Errors in plain language.** JavaScript exceptions, failed requests, 404s, blocked content, `console.warn`: grouped, explained, with file and line. Errors after a reload are marked *New*; older ones fade.
- **One button when something fails.** Phone unplugged, server down, Chrome tab closed: the panel says what happened and offers a single button to fix it.
- **Report for your AI.** One click copies every error, in a format an assistant can act on. Each error also has its own *Copy for AI*.
- **Test conditions.** Dark or light theme, reduced animations, high contrast, color-blindness and blurred vision, another time zone, language and location, other screen sizes, going offline, and a one-click **slow phone** (3G network + a CPU 4× slower) to see how your site runs on a low-end device.
- **Inspector.** Tap any element in the mirror: you get its selector, size, colors, font and spacing, a warning if it is too small to tap, and a button that copies it for your AI.
- **Network.** Every request the page makes with its size and time, what weighs the most (with a hint when an image could be lighter), what fails, and *copy as curl*.
- **Site data.** What your site saved on the phone — local storage, cookies, service workers — and *Start fresh*, which deletes it (for that site only) and reloads like a first visit.
- **Quick site review.** Overflow, tiny tap targets, contrast, missing alt text…
- **Phone console.** `console.log` output next to the errors.
- **Several phones.** Pick which one to use when more than one is connected.
- **Keeps the screen awake** while it runs, and puts everything back when it closes. Leaves **nothing running** in the background.
- **Windows, Mac and Linux**, in **English and Spanish**, light and dark.

<p align="center">
  <img src="docs/img/inspector.png" alt="The inspector showing the element tapped on the phone's mirror, highlighted" width="49%">
  <img src="docs/img/network.png" alt="The network tab listing each request with its size and time" width="49%">
</p>

## How it works

celular-dev talks to the phone with ADB (`reverse` makes the PC's `localhost` reachable from the phone, `forward` opens Chrome's DevTools socket) and drives Chrome with the DevTools Protocol. There is no app on the phone and no cloud involved: everything stays between your PC and your phone.

Some choices that made it work well:

- **The mirror is built for latency, not just for looking right.** Frames come from `Page.startScreencast`, are requested at the width the panel actually shows (latency grows with pixels: 108 ms at 720 px vs 58 ms at 360 px on the test phone), and are drawn on a `<canvas>`. An `<img>` on a multipart stream shows each frame only when the *next* one starts, so the last frame of a still screen would never appear — the canvas fixes that.
- **Sharp when it matters.** While you interact, light frames; after 300 ms of stillness, a full-resolution capture clipped to the visual viewport.
- **Testable without a phone.** The whole app takes ADB, Chrome, the panel and the system dialogs by injection, so 130+ tests drive the real flow (startup, reconnects, mirror, errors, language…) against a simulated phone, on Windows, macOS and Linux in CI.
- **Zero dependencies.** Node's standard library only: its own static server, ZIP and tar.gz writers, and ADB and DevTools clients. Releases bundle Node, verified against its published checksums.
- **Clean exit.** It restores the phone's settings and stops the ADB service only if it was the one that started it.

## Status and roadmap

Works today on the test phone (Motorola moto g24 power, Android 14) and is covered by automated tests on three operating systems. It has been tried on one real phone so far, so **reports from other phones are very welcome** — use *Copy diagnostics* in the panel and open an issue.

Next: connecting over Wi-Fi (no cable), a VS Code extension, recording the phone screen, and device buttons (rotate, volume, home).

## License

[MIT](LICENSE) © Santiago Nardini

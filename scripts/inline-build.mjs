// Turns dist/ into one self-contained file, dist/standalone.html, that opens with a double click.
// Browsers refuse module scripts and fonts loaded from file:// URLs, so everything is inlined.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = fileURLToPath(new URL('../dist/', import.meta.url))
const read = (path) => readFileSync(join(dist, path))

let html = read('index.html').toString()

// Fonts are referenced from the CSS, so they become data URLs first.
const inlineFonts = (css) =>
  css.replace(/url\(\.?\/?(assets\/[^)]+\.woff2)\)/g, (_, path) => `url(data:font/woff2;base64,${read(path).toString('base64')})`)

html = html.replace(/<link rel="stylesheet"[^>]*href="\.?\/?(assets\/[^"]+\.css)"[^>]*>/g, (_, path) => `<style>${inlineFonts(read(path).toString())}</style>`)

html = html.replace(/<script type="module"[^>]*src="\.?\/?(assets\/[^"]+\.js)"[^>]*><\/script>/g, (_, path) => {
  const js = read(path).toString().replace(/<\/script/gi, '<\\/script')
  return `<script type="module">${js}</script>`
})

html = html.replace(/<link rel="icon"[^>]*>/, `<link rel="icon" href="data:image/svg+xml;base64,${read('favicon.svg').toString('base64')}" />`)

writeFileSync(join(dist, 'standalone.html'), html)
console.log(`dist/standalone.html written (${Math.round(html.length / 1024)} KB)`)

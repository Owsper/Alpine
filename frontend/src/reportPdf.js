// Writes the report as a PDF by hand so that no library is needed. One Letter page, built-in fonts only.

const PAGE = { width: 612, height: 792, margin: 54 }
const COLORS = {
  ink: [0.12, 0.12, 0.11],
  muted: [0.42, 0.41, 0.39],
  border: [0.89, 0.88, 0.85],
  primary: [0.08, 0.34, 0.25],
  bar: [0.04, 0.52, 0.34],
  barBefore: [0.63, 0.63, 0.63],
  track: [0.92, 0.92, 0.92],
  amber: [0.52, 0.31, 0.04],
  amberTint: [0.98, 0.93, 0.85],
  goodTint: [0.92, 0.95, 0.87],
  good: [0.08, 0.4, 0.11],
}
// Characters the built-in fonts can show that sit outside Latin-1.
const WIN_ANSI = { '–': 0x96, '—': 0x97, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '…': 0x85 }

function pdfString(text) {
  let out = ''
  for (const char of text) {
    const code = WIN_ANSI[char] ?? char.codePointAt(0)
    if (code > 0xff) out += '?'
    else if (code < 0x20 || code > 0x7e || '()\\'.includes(char)) out += `\\${code.toString(8).padStart(3, '0')}`
    else out += char
  }
  return `(${out})`
}

function truncate(text, length) {
  const clean = text.trim().replace(/\s+/g, ' ')
  return clean.length > length ? `${clean.slice(0, length - 1).trimEnd()}…` : clean
}

function rgb(color, operator) {
  return `${color.join(' ')} ${operator}`
}

// Positions are measured from the top of the page, which reads more naturally than PDF's bottom-up.
function createPage() {
  const ops = []
  return {
    ops,
    text(value, x, top, { size = 11, bold = false, color = COLORS.ink } = {}) {
      ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${rgb(color, 'rg')} ${x} ${PAGE.height - top} Td ${pdfString(value)} Tj ET`)
    },
    rect(x, top, width, height, fill) {
      ops.push(`${rgb(fill, 'rg')} ${x} ${PAGE.height - top - height} ${width} ${height} re f`)
    },
    line(x1, x2, top) {
      ops.push(`${rgb(COLORS.border, 'RG')} 0.75 w ${x1} ${PAGE.height - top} m ${x2} ${PAGE.height - top} l S`)
    },
  }
}

function assemble(content) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Contents 6 0 R /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = objects.map((object, i) => {
    const offset = pdf.length
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`
    return offset
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  pdf += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return pdf
}

function formatDelta(delta) {
  return delta > 0 ? `+${delta}` : String(delta)
}

export function buildReportPdf({ job, date, title, stats, rows, previous, latest, strongest, focus, focusFix = '', demo = false }) {
  const page = createPage()
  const left = PAGE.margin
  const right = PAGE.width - PAGE.margin
  const comparing = rows[0].after !== undefined
  let top = 62

  page.text('Alpine', left, top, { size: 12, bold: true, color: COLORS.primary })
  top += 34
  page.text(title, left, top, { size: 24, bold: true })
  top += 24
  page.text(truncate(`${job.company} · ${job.role}`, 80), left, top, { size: 12 })
  top += 17
  page.text(date, left, top, { size: 10, color: COLORS.muted })
  top += 16

  page.rect(left, top, right - left, 26, demo ? COLORS.amberTint : COLORS.goodTint)
  page.text(
    demo ? 'Demo data: these are sample scores, not an assessment of your answers.' : 'Practice guidance from an AI, not a hiring decision. Each score quotes your own words.',
    left + 10,
    top + 17,
    { size: 10, color: demo ? COLORS.amber : COLORS.good },
  )
  top += 42

  const gap = 12
  const statWidth = (right - left - gap * 2) / 3
  stats.forEach((stat, i) => {
    const x = left + i * (statWidth + gap)
    page.rect(x, top, statWidth, 58, stat.good ? COLORS.goodTint : [0.98, 0.976, 0.965])
    page.text(stat.label, x + 12, top + 19, { size: 10, color: COLORS.muted })
    page.text(stat.value, x + 12, top + 44, { size: 20, bold: true, color: stat.good ? COLORS.good : COLORS.ink })
  })
  top += 86

  page.text('Scores by dimension', left, top, { size: 14, bold: true })
  top += 22
  page.text('Dimension', left, top, { size: 9, color: COLORS.muted })
  page.text('Score out of 5', 175, top, { size: 9, color: COLORS.muted })
  if (comparing) page.text('Change', right - 36, top, { size: 9, color: COLORS.muted })
  top += 8

  const trackX = 232
  const trackWidth = comparing ? 200 : 240
  const scoreLine = (label, score, color, lineTop) => {
    page.text(label, 175, lineTop + 7, { size: 8, color: COLORS.muted })
    page.rect(trackX, lineTop, trackWidth, 6, COLORS.track)
    page.rect(trackX, lineTop, (trackWidth * score) / 5, 6, color)
    page.text(`${score.toFixed(1)} / 5`, trackX + trackWidth + 8, lineTop + 7, { size: 9 })
  }
  rows.forEach((row) => {
    page.line(left, right, top)
    const height = comparing ? 36 : 24
    page.text(row.name, left, top + height / 2 + 4, { size: 11, bold: true })
    scoreLine(`Interview ${previous}`, row.before, comparing ? COLORS.barBefore : COLORS.bar, top + 9)
    if (comparing) {
      scoreLine(`Interview ${latest}`, row.after, COLORS.bar, top + 22)
      page.text(formatDelta(row.after - row.before), right - 30, top + 22, { size: 12, bold: true, color: row.after > row.before ? COLORS.good : COLORS.muted })
    }
    top += height
  })
  page.line(left, right, top)
  top += 30

  page.text('Strongest area', left, top, { size: 10, color: COLORS.muted })
  page.text(strongest, left, top + 17, { size: 13, bold: true })
  page.text('Focus next', left + 252, top, { size: 10, color: COLORS.muted })
  page.text(focus, left + 252, top + 17, { size: 13, bold: true })
  if (focusFix) page.text(truncate(focusFix, 60), left + 252, top + 34, { size: 9, color: COLORS.muted })

  return assemble(page.ops.join('\n'))
}

export function downloadPdf(pdf, company) {
  const slug = company.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  const url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `alpine-report${slug ? `-${slug}` : ''}.pdf`
  document.body.append(link)
  link.click()
  link.remove()
  // Some browsers start the download after the click returns, so the file stays available briefly.
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

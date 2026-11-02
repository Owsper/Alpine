// Demo content from the Figma file. Nothing here comes from a real backend yet.

export const steps = [
  { to: '/', label: 'Job posting' },
  { to: '/research', label: 'Research' },
  { to: '/interview', label: 'Interview' },
  { to: '/report', label: 'Report' },
  { to: '/progress', label: 'Progress' },
]

export const company = 'Acme Robotics'

export const facts = [
  {
    id: 'company',
    tag: 'Company',
    text: 'Builds warehouse robots for mid-size logistics firms.',
    source: 'acme-robotics.example/about',
    retrieved: '2 Nov 2026',
  },
  {
    id: 'role',
    tag: 'Role',
    text: 'The team owns the fleet-control service, written in Go and TypeScript.',
    source: 'acme-robotics.example/careers/swe-ws',
    retrieved: '2 Nov 2026',
  },
  {
    id: 'culture',
    tag: 'Culture',
    text: 'Values written design docs and code reviews before shipping.',
    source: 'acme-robotics.example/handbook',
    retrieved: '2 Nov 2026',
  },
]

export function isEdited(fact) {
  const original = facts.find(({ id }) => id === fact.id)
  return Boolean(original) && original.text !== fact.text.trim()
}

// Trims the text and drops facts left empty.
export function cleanFacts(list) {
  return list.map((fact) => ({ ...fact, text: fact.text.trim() })).filter((fact) => fact.text)
}

const questionPlan = [
  { text: 'Tell me about yourself' },
  { text: 'Learning under a deadline', factId: 'role' },
  { text: 'A time you disagreed', factId: 'culture' },
  { text: 'Debugging a hard issue' },
  { text: `Why ${company}`, factId: 'company' },
]

function factQuestion(fact) {
  return `Your take on: ${fact.text}`
}

// A placeholder for a real generator. A question based on a removed fact is dropped,
// one based on an edited fact is rewritten, and each added fact gets its own question.
export function generateQuestions(currentFacts) {
  const planned = questionPlan.flatMap(({ text, factId }) => {
    if (!factId) return [text]
    const fact = currentFacts.find(({ id }) => id === factId)
    if (!fact) return []
    return [isEdited(fact) ? factQuestion(fact) : text]
  })
  const added = currentFacts.filter((fact) => fact.added).map(factQuestion)
  return [...new Set([...planned, ...added])]
}

// Every new interview begins at the first question. Nothing advances it yet.
// Wording kept for when captions or voice arrive, for "Learning under a deadline":
// Tell me about a time you had to learn a new technology under a tight deadline.
export const currentQuestion = { index: 0 }

// Listed clockwise from the top of the radar chart.
export const dimensions = [
  { name: 'STAR structure', session1: 2, session2: 4 },
  { name: 'Relevance', session1: 3, session2: 4 },
  { name: 'Role knowledge', session1: 3, session2: 3 },
  { name: 'Company fit', session1: 2, session2: 3 },
  { name: 'Conciseness', session1: 3, session2: 4 },
  { name: 'Evidence', session1: 2, session2: 3 },
]

export function averageScore(key) {
  return dimensions.reduce((sum, d) => sum + d[key], 0) / dimensions.length
}

// Demo results. Only two sets exist, so any later interview reuses the second.
export const sessionResults = [
  { key: 'session1', strongest: 'Relevance', focus: 'STAR, Evidence' },
  { key: 'session2', strongest: 'STAR structure', focus: 'Role, Evidence' },
]

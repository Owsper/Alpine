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
    tag: 'Company',
    text: 'Builds warehouse robots for mid-size logistics firms.',
    source: 'acme-robotics.example/about',
    retrieved: '2 Nov 2026',
  },
  {
    tag: 'Role',
    text: 'The team owns the fleet-control service, written in Go and TypeScript.',
    source: 'acme-robotics.example/careers/swe-ws',
    retrieved: '2 Nov 2026',
  },
  {
    tag: 'Culture',
    text: 'Values written design docs and code reviews before shipping.',
    source: 'acme-robotics.example/handbook',
    retrieved: '2 Nov 2026',
  },
]

export const questions = [
  'Tell me about yourself',
  'Learning under a deadline',
  'A time you disagreed',
  'Debugging a hard issue',
  `Why ${company}`,
]

export const currentQuestion = {
  index: 1,
  text: 'Tell me about a time you had to learn a new technology under a tight deadline.',
}

export const sessionStartSeconds = 6 * 60 + 42

// Listed clockwise from the top of the radar chart.
export const dimensions = [
  { name: 'STAR structure', session1: 2, session2: 4 },
  { name: 'Relevance', session1: 3, session2: 4 },
  { name: 'Role knowledge', session1: 3, session2: 3 },
  { name: 'Company fit', session1: 2, session2: 3 },
  { name: 'Conciseness', session1: 3, session2: 4 },
  { name: 'Evidence', session1: 2, session2: 3 },
]

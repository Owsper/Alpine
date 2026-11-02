// Reveals text letter by letter. Screen readers get the plain string from aria-label.
export default function SplitText({ text, as: Tag = 'span', className = '', step = 22, delay = 0 }) {
  const words = text.split(' ')
  let index = 0

  return (
    <Tag className={`split ${className}`} aria-label={text}>
      {words.map((word, w) => (
        <span className="split-word" aria-hidden="true" key={w}>
          {[...word].map((char, c) => (
            <span className="split-char" key={c} style={{ '--delay': `${delay + index++ * step}ms` }}>
              {char}
            </span>
          ))}
          {w < words.length - 1 && ' '}
        </span>
      ))}
    </Tag>
  )
}

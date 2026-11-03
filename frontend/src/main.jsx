import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App.jsx'
import './alpine.css'

// No StrictMode: its double effects would start the microphone and the interview twice.
// Hash routes (app.html#/practice) work from the dev server, a static host or a plain file.
createRoot(document.getElementById('root')).render(
  <HashRouter>
    <App />
  </HashRouter>,
)

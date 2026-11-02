import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import '@fontsource-variable/inter'
import '@fontsource-variable/bricolage-grotesque'
import App from './App.jsx'
import { FlowProvider } from './flow.jsx'
import './styles.css'
import './layout.css'
import './call.css'
import './motion.css'

// Opened straight from disk there is no server to answer /research, so routes live in the hash.
const Router = window.location.protocol === 'file:' ? HashRouter : BrowserRouter

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Router>
      <FlowProvider>
        <App />
      </FlowProvider>
    </Router>
  </StrictMode>,
)

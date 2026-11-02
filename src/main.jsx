import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource-variable/inter'
import App from './App.jsx'
import { FlowProvider } from './flow.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <FlowProvider>
        <App />
      </FlowProvider>
    </BrowserRouter>
  </StrictMode>,
)

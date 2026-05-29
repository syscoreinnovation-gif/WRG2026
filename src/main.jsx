import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import WRGDashboard from './WRG2026-Dashboard.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <WRGDashboard />
  </StrictMode>,
)
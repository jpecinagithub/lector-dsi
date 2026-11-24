import React from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import App from './App.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /><Analytics /></React.StrictMode>
)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}

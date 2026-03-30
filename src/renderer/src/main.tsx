import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/global.css'

// Apply persisted theme override before first render to avoid flash
window.darkscribe.app.getTheme().then(t => {
  if (t === 'light' || t === 'dark') {
    document.documentElement.setAttribute('data-theme', t)
  }
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

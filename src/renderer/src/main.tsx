import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

// apply the saved theme before first paint so there's no flash of default
window.scribe.settings.get().then((s) => {
  document.documentElement.dataset.theme = s.theme
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
})

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import './types/ipc.types'

if (/widget=[a-z]+/.test(window.location.hash)) {
  document.documentElement.classList.add('widget-mode')
  document.body.classList.add('widget-mode')
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

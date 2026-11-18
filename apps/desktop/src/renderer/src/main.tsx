import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { SettingsWindow } from './components/SettingsWindow'
import { WidgetRegistryProvider } from './widgets/WidgetRegistryProvider'
import './styles/panel.css'
import './styles/customize.css'

const standaloneSettings = new URLSearchParams(window.location.search).has('settings')

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <WidgetRegistryProvider>
      {standaloneSettings ? <SettingsWindow /> : <App />}
    </WidgetRegistryProvider>
  </StrictMode>
)

import { createRoot } from 'react-dom/client'
import { App } from './App'
import { loadSettings } from './settings'
import './styles.css'

loadSettings()

const root = document.getElementById('root')
if (!root) throw new Error('Missing root')
createRoot(root).render(<App />)

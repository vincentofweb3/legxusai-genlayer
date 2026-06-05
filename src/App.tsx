import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppProvider } from './lib/store'
import Layout from './components/layout/Layout'
import LandingPage from './pages/LandingPage'
import Dashboard from './pages/Dashboard'
import DisputesPage from './pages/DisputesPage'
import FileDisputePage from './pages/FileDisputePage'
import PredictionsPage from './pages/PredictionsPage'
import ExplorerPage from './pages/ExplorerPage'
import ContractsPage from './pages/ContractsPage'

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/disputes" element={<DisputesPage />} />
            <Route path="/disputes/new" element={<FileDisputePage />} />
            <Route path="/predictions" element={<PredictionsPage />} />
            <Route path="/explorer" element={<ExplorerPage />} />
            <Route path="/contracts" element={<ContractsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProvider>
  )
}

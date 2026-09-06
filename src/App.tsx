import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { BooksPage } from './pages/BooksPage'
import { LoginPage } from './pages/LoginPage'
import { ReaderPage } from './pages/ReaderPage'

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/books" element={<BooksPage />} />
          <Route path="/reader/:bookId" element={<ReaderPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/books" replace />} />
    </Routes>
  )
}

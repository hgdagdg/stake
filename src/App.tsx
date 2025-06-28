import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AuthForm } from './components/AuthForm';
import { HomePage } from './pages/HomePage';
import { CreateRoomPage } from './pages/CreateRoomPage';
import { OrganiseRoomPage } from './pages/OrganiseRoomPage';
import { RoomPage } from './pages/RoomPage';
import { JoinRoomPage } from './pages/JoinRoomPage';
import { LiveDebatePage } from './pages/LiveDebatePage';
import { ArchivePage } from './pages/ArchivePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { useAuth } from './hooks/useAuth';

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/auth" element={
          user ? <Navigate to="/" replace /> : <AuthForm />
        } />
        <Route path="/" element={
          <Layout>
            <HomePage />
          </Layout>
        } />
        <Route path="/create" element={
          <Layout>
            <CreateRoomPage />
          </Layout>
        } />
        <Route path="/room/:roomId/organise" element={
          <Layout>
            <OrganiseRoomPage />
          </Layout>
        } />
        <Route path="/room/:roomId/join" element={
          <Layout>
            <JoinRoomPage />
          </Layout>
        } />
        <Route path="/room/:roomId/live" element={
          <LiveDebatePage />
        } />
        <Route path="/room/:roomId" element={
          <Layout>
            <RoomPage />
          </Layout>
        } />
        <Route path="/archive" element={
          <Layout>
            <ArchivePage />
          </Layout>
        } />
        <Route path="*" element={
          <Layout>
            <NotFoundPage />
          </Layout>
        } />
      </Routes>
    </Router>
  );
}

export default App;
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import HomeMap from './pages/HomeMap';
import StoreDashboard from './pages/StoreDashboard';

import 'mapbox-gl/dist/mapbox-gl.css';
import './index.css';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomeMap />} />
        <Route path="/store/:id" element={<StoreDashboard />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

export default function MissionRouteRedirect() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const missionId = params.get('mission');
  const section = params.get('section');
  const suffix = section ? `?section=${encodeURIComponent(section)}` : '';

  return (
    <Navigate
      replace
      to={missionId ? `/missions/${encodeURIComponent(missionId)}${suffix}` : '/missions'}
    />
  );
}

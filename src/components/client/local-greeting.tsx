'use client';

import { useEffect, useState } from 'react';

// Server-rendered greetings are computed in UTC, so a 7 AM ET user sees
// "Good afternoon" because UTC has already crossed noon. Render the
// greeting on the client from the browser's local hour, with a sensible
// SSR fallback that won't flash a wrong time-of-day.
function greetingFromHour(hour: number): string {
  if (hour < 5) return 'Late night';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function LocalGreeting() {
  const [hour, setHour] = useState<number | null>(null);
  useEffect(() => {
    setHour(new Date().getHours());
  }, []);
  return <>{hour === null ? 'Welcome' : greetingFromHour(hour)}</>;
}

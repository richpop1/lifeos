'use client';
import { useSession } from 'next-auth/react';
import { LoginPage } from '@/components/login-page';
import { Dashboard } from '@/components/dashboard';

export function AuthGate() {
  const { data: session, status } = useSession() || {};

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session) return <LoginPage />;
  return <Dashboard />;
}

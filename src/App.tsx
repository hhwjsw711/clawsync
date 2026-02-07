import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useQuery } from 'convex/react';
import { UpdateBanner } from '@convex-dev/self-static-hosting/react';
import { api } from '../convex/_generated/api';
import { LandingPage } from './pages/LandingPage';
import { ChatPage } from './pages/ChatPage';
import { SetupWizard } from './pages/SetupWizard';
import { SyncBoardLogin } from './pages/SyncBoardLogin';
import { SyncBoard } from './pages/SyncBoard';
import { SyncBoardSoul } from './pages/SyncBoardSoul';
import { SyncBoardModels } from './pages/SyncBoardModels';
import { SyncBoardSkills } from './pages/SyncBoardSkills';
import { SyncBoardSkillNew } from './pages/SyncBoardSkillNew';
import { SyncBoardSkillDetail } from './pages/SyncBoardSkillDetail';
import { SyncBoardMcp } from './pages/SyncBoardMcp';
import { SyncBoardChannels } from './pages/SyncBoardChannels';
import { SyncBoardThreads } from './pages/SyncBoardThreads';
import { SyncBoardActivity } from './pages/SyncBoardActivity';
import { SyncBoardConfig } from './pages/SyncBoardConfig';
import { SyncBoardApi } from './pages/SyncBoardApi';
import { SyncBoardX } from './pages/SyncBoardX';
import { SyncBoardAgentMail } from './pages/SyncBoardAgentMail';

// Wrapper component to check if setup is required
function SetupGuard({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const setupRequired = useQuery(api.setup.isRequired);

  // Show nothing while loading
  if (setupRequired === undefined) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--bg-primary)',
      }}>
        <div>Loading...</div>
      </div>
    );
  }

  // Redirect to setup if required (unless already on setup page)
  if (setupRequired && location.pathname !== '/setup') {
    return <Navigate to="/setup" replace />;
  }

  // Redirect away from setup if not required
  if (!setupRequired && location.pathname === '/setup') {
    return <Navigate to="/chat" replace />;
  }

  return <>{children}</>;
}

/**
 * SyncBoard Authentication Guard
 *
 * Currently uses simple password-based auth (SYNCBOARD_PASSWORD_HASH).
 *
 * FUTURE: Will be replaced with WorkOS AuthKit for enterprise SSO.
 * When WorkOS is enabled:
 * 1. Import useAuth from @workos-inc/authkit-react
 * 2. Replace password check with: const { isAuthenticated, user } = useAuth()
 * 3. Show login UI from AuthKit instead of SyncBoardLogin
 * 4. Session management handled by AuthKit cookies
 *
 * See: https://docs.convex.dev/auth/authkit/
 * See: convex/auth.config.ts for backend configuration
 */
function SyncBoardAuthGuard({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  // Check if auth is enabled
  const authEnabled = useQuery(api.syncboardAuth.isEnabled);

  // Verify existing token
  const sessionValid = useQuery(
    api.syncboardAuth.verifySession,
    token ? { token } : 'skip'
  );

  // Load token from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('syncboard_token');
    const expiresAt = localStorage.getItem('syncboard_token_expires');

    // Check if token is expired locally
    if (storedToken && expiresAt) {
      if (Date.now() > parseInt(expiresAt, 10)) {
        localStorage.removeItem('syncboard_token');
        localStorage.removeItem('syncboard_token_expires');
        setIsChecking(false);
        return;
      }
    }

    setToken(storedToken);
    setIsChecking(false);
  }, []);

  // Handle login
  const handleLogin = (newToken: string) => {
    setToken(newToken);
  };

  // Still loading auth state
  if (authEnabled === undefined || isChecking) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--bg-primary)',
      }}>
        <div>Loading...</div>
      </div>
    );
  }

  // Auth is disabled - allow access
  if (!authEnabled) {
    return <>{children}</>;
  }

  // No token or invalid token - show login
  if (!token || (sessionValid && !sessionValid.valid)) {
    // Clear invalid token
    if (token && sessionValid && !sessionValid.valid) {
      localStorage.removeItem('syncboard_token');
      localStorage.removeItem('syncboard_token_expires');
    }
    return <SyncBoardLogin onLogin={handleLogin} />;
  }

  // Still verifying token
  if (sessionValid === undefined) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--bg-primary)',
      }}>
        <div>Verifying session...</div>
      </div>
    );
  }

  // Token is valid
  return <>{children}</>;
}

export function App() {
  return (
    <BrowserRouter>
      {/* Live reload banner when new deployment is available */}
      <UpdateBanner
        getCurrentDeployment={api.staticHosting.getCurrentDeployment}
        message="A new version is available!"
        buttonText="Refresh"
      />
      <SetupGuard>
        <Routes>
          {/* Setup wizard (first-run) */}
          <Route path="/setup" element={<SetupWizard />} />

          {/* Public routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/chat" element={<ChatPage />} />

          {/* SyncBoard routes (admin) - protected by password auth */}
          <Route path="/syncboard" element={<SyncBoardAuthGuard><SyncBoard /></SyncBoardAuthGuard>} />
          <Route path="/syncboard/soul" element={<SyncBoardAuthGuard><SyncBoardSoul /></SyncBoardAuthGuard>} />
          <Route path="/syncboard/models" element={<SyncBoardAuthGuard><SyncBoardModels /></SyncBoardAuthGuard>} />
          <Route path="/syncboard/skills" element={<SyncBoardAuthGuard><SyncBoardSkills /></SyncBoardAuthGuard>} />
          <Route path="/syncboard/skills/new" element={<SyncBoardAuthGuard><SyncBoardSkillNew /></SyncBoardAuthGuard>} />
          <Route path="/syncboard/skills/:id" element={<SyncBoardAuthGuard><SyncBoardSkillDetail /></SyncBoardAuthGuard>} />
          <Route path="/syncboard/mcp" element={<SyncBoardAuthGuard><SyncBoardMcp /></SyncBoardAuthGuard>} />
          <Route path="/syncboard/channels" element={<SyncBoardAuthGuard><SyncBoardChannels /></SyncBoardAuthGuard>} />
          <Route path="/syncboard/threads" element={<SyncBoardAuthGuard><SyncBoardThreads /></SyncBoardAuthGuard>} />
          <Route path="/syncboard/activity" element={<SyncBoardAuthGuard><SyncBoardActivity /></SyncBoardAuthGuard>} />
          <Route path="/syncboard/config" element={<SyncBoardAuthGuard><SyncBoardConfig /></SyncBoardAuthGuard>} />
          <Route path="/syncboard/api" element={<SyncBoardAuthGuard><SyncBoardApi /></SyncBoardAuthGuard>} />
          <Route path="/syncboard/x" element={<SyncBoardAuthGuard><SyncBoardX /></SyncBoardAuthGuard>} />
          <Route path="/syncboard/agentmail" element={<SyncBoardAuthGuard><SyncBoardAgentMail /></SyncBoardAuthGuard>} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Routes>
      </SetupGuard>
    </BrowserRouter>
  );
}

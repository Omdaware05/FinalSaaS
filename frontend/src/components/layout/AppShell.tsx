import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { QuickDialModal } from './QuickDialModal';
import { AuthModal } from './AuthModal';
import { GlowProvider } from '../effects/GlowProvider';
import { AmbientBackground } from '../effects/AmbientBackground';
import { ModernShell } from '../../features/modern/ModernShell';
import { useTheme } from '../../app/providers/ThemeProvider';
import { clsx } from 'clsx';

export const AppShell: React.FC = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [quickDialOpen, setQuickDialOpen] = useState(false);
  const location = useLocation();

  // Dynamic ?accent= URL support (e.g. ?accent=violet)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const accent = params.get('accent');
    if (accent) {
      document.documentElement.setAttribute('data-accent', accent);
    } else {
      document.documentElement.removeAttribute('data-accent');
    }
  }, [location.search]);

  useEffect(() => {
    const handleTrigger = () => setQuickDialOpen(true);
    window.addEventListener('voxora-quick-dial', handleTrigger);
    return () => window.removeEventListener('voxora-quick-dial', handleTrigger);
  }, []);

  const { look } = useTheme();

  // Modern look: a completely separate shell (icon rail + top bar).
  // Global modals stay mounted in both looks.
  if (look === 'modern') {
    return (
      <>
        <ModernShell />
        <QuickDialModal isOpen={quickDialOpen} onClose={() => setQuickDialOpen(false)} />
        <AuthModal />
      </>
    );
  }

  return (
    <GlowProvider>
      <div className="relative min-h-screen text-slate-900 dark:text-neutral-100 flex flex-col transition-colors duration-150">
        {/* Fixed, non-scrolling, pointer-events:none ambient background layer behind everything */}
        <AmbientBackground />

        {/* Content Shell Layer above ambient background */}
        <div className="relative z-[1] flex min-h-screen">
          {/* Sidebar Navigation */}
          <Sidebar
            isCollapsed={isCollapsed}
            onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
            mobileOpen={mobileOpen}
            onCloseMobile={() => setMobileOpen(false)}
          />

          {/* Main Content Area: Offset by sidebar width on desktop */}
          <div
            className={clsx(
              'flex-1 flex flex-col transition-all duration-200 min-w-0',
              isCollapsed ? 'md:pl-16' : 'md:pl-64'
            )}
          >
            <Header
              onOpenMobileSidebar={() => setMobileOpen(true)}
              onOpenQuickDial={() => setQuickDialOpen(true)}
            />

            <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
              {/* Keyed by route: every page change replays a short,
                  premium fade-rise transition */}
              <div key={location.pathname} className="anim-page">
                <Outlet />
              </div>
            </main>
          </div>
        </div>

        {/* Global Modals */}
        <QuickDialModal isOpen={quickDialOpen} onClose={() => setQuickDialOpen(false)} />
        <AuthModal />
      </div>
    </GlowProvider>
  );
};

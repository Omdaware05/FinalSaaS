import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarDays,
  Building2,
  Bot,
  PhoneCall,
  Users,
  Target,
  CalendarClock,
  BarChart3,
  Receipt,
  Settings,
  Search,
} from 'lucide-react';
import { clsx } from 'clsx';
import { BrandMark } from '../../components/ui/BrandMark';
import { LookToggle } from '../../components/layout/LookToggle';
import { BusinessSelector } from '../../components/ui/BusinessSelector';
import { useActiveCalls } from '../../hooks/useActiveCalls';

interface NavItem {
  name: string;
  href: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  live?: boolean;
}

const NAV: NavItem[] = [
  { name: 'Overview', href: '/', icon: LayoutDashboard, end: true },
  { name: 'Businesses', href: '/businesses', icon: Building2 },
  { name: 'Agents', href: '/agents', icon: Bot },
  { name: 'Calls', href: '/calls', icon: PhoneCall, live: true },
  { name: 'Contacts', href: '/contacts', icon: Users },
  { name: 'Leads', href: '/leads', icon: Target },
  { name: 'Follow-ups', href: '/followups', icon: CalendarClock },
  { name: 'Calendar', href: '/calendar', icon: CalendarDays },
  { name: 'Reports', href: '/reports', icon: BarChart3 },
  { name: 'Billing', href: '/invoices', icon: Receipt },
  { name: 'Settings', href: '/settings', icon: Settings },
];

/**
 * Modern shell: a slim icon rail + clean top bar, with comfortable margins,
 * high visual contrast, responsive business switcher, and global quick dialing.
 */
export const ModernShell: React.FC = () => {
  const location = useLocation();
  const { activeCount } = useActiveCalls();

  const handleOpenQuickDial = () => {
    window.dispatchEvent(new CustomEvent('voxora-quick-dial'));
  };

  const railLink = (item: NavItem) => (
    <NavLink
      key={item.href}
      to={item.href}
      end={item.end}
      title={item.name}
      className={({ isActive }) =>
        clsx(
          'relative w-[80px] py-2 px-1 rounded-xl flex flex-col items-center gap-1 transition-all duration-150',
          isActive
            ? 'bg-[#101828] text-white shadow-[0_4px_12px_-2px_rgba(16,24,40,0.35)]'
            : 'text-[#475467] hover:text-[#101828] hover:bg-[#EEF1F4]'
        )
      }
    >
      <item.icon className="w-5 h-5" strokeWidth={1.9} />
      <span className="text-[10px] font-semibold leading-tight tracking-tight text-center whitespace-nowrap overflow-hidden text-ellipsis max-w-full block">
        {item.name}
      </span>
      {item.live && activeCount > 0 && (
        <span className="absolute top-1 right-2.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white animate-pulse" />
      )}
    </NavLink>
  );

  return (
    <div className="min-h-screen bg-[#F4F5F7] text-[#101828] flex">
      {/* Icon rail (desktop) */}
      <aside className="hidden md:flex w-[92px] shrink-0 flex-col items-center bg-white border-r border-[#E8EAED] sticky top-0 h-screen py-4 z-40 select-none shadow-[1px_0_4px_rgba(16,24,40,0.02)]">
        <NavLink to="/" className="mb-3 hover:opacity-90 transition-opacity" title="ARB SoftTech Platform">
          <BrandMark className="w-10 h-10" />
        </NavLink>
        <nav className="flex-1 flex flex-col items-center gap-1 overflow-y-auto w-full px-1.5 pb-2">
          {NAV.map(railLink)}
        </nav>
        <div className="pt-2 border-t border-[#EEF0F2] flex flex-col items-center gap-1.5 w-full">
          <div
            className="w-8 h-8 rounded-full bg-gradient-to-tr from-slate-900 to-slate-700 text-white flex items-center justify-center text-[10px] font-bold shadow-xs cursor-default"
            title="ARB SoftTech Enterprise workspace"
          >
            AR
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar - Solid background prevents scrolled content from bleeding through */}
        <header className="sticky top-0 z-30 bg-[#F4F5F7] px-4 sm:px-6 lg:px-8 py-3 border-b border-[#E8EAED] shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
          <div className="w-full max-w-[1440px] mx-auto flex items-center gap-3">
            <NavLink to="/" className="md:hidden shrink-0">
              <BrandMark className="w-9 h-9" />
            </NavLink>
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-[#667085] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search businesses, leads, calls, agents…"
                className="w-full h-10 pl-11 pr-4 rounded-full bg-white border border-[#E8EAED] text-[13px] text-[#101828] placeholder-[#667085] shadow-[0_1px_2px_rgba(16,24,40,0.04)] focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 transition-all"
              />
            </div>
            <div className="ml-auto flex items-center gap-2.5 shrink-0">
              {/* Business Selector visible on mobile/tablet/desktop */}
              <div className="hidden sm:block">
                <BusinessSelector />
              </div>

              {/* Quick Dial Outbound Action */}
              <button
                type="button"
                onClick={handleOpenQuickDial}
                title="Place a Quick Outbound Call"
                className="h-10 px-4 rounded-full bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-[0_2px_8px_rgba(234,88,12,0.25)] active:scale-95 transition-all cursor-pointer"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Quick Dial</span>
              </button>

              <LookToggle />
            </div>
          </div>
        </header>

        {/* Mobile nav strip */}
        <nav className="md:hidden flex gap-1.5 overflow-x-auto px-4 py-2 bg-white border-b border-[#E8EAED] shadow-xs">
          {NAV.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              end={item.end}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all',
                  isActive ? 'bg-[#101828] text-white' : 'bg-[#F2F4F7] text-[#475467] hover:text-[#101828]'
                )
              }
            >
              <item.icon className="w-3.5 h-3.5" />
              {item.name}
            </NavLink>
          ))}
        </nav>

        {/* Generous, comfortable content container with proper breathing room */}
        <main className="flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pb-16 pt-6">
          <div key={location.pathname} className="anim-page">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

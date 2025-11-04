import { Link, NavLink, Outlet } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Button } from '../components/ui/button'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabaseClient'
import { IconAccounts, IconBrand, IconDashboard, IconParties, IconReports, IconSignOut, IconTransactions, IconCategories, IconAccounts as IconTransfers } from '../components/icons'
import { AppIcon } from '../components/ui/appicon'
import SettingsDialog from '../features/settings/SettingsDialog'
import InventoryNotificationBell from '../features/notifications/InventoryNotificationBell'

function NavItem({ to, label, icon: Icon, iconName }: { to: string; label: string; icon?: (props: any) => JSX.Element; iconName: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `px-3 py-2 text-sm rounded-md flex items-center gap-3 ${isActive ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50'}`
      }
    >
      <AppIcon name={iconName} size={18} className="opacity-90" fallback={Icon ? <Icon size={18} className="opacity-90" /> : null} />
      <span>{label}</span>
    </NavLink>
  )
}

export default function AppLayout() {
  const { user } = useAuth()
  // Re-render when settings change (currency/locale/theme)
  const [, setSettingsVersion] = useState(0)
  const [globalSearch, setGlobalSearch] = useState('')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  
  useEffect(() => {
    const handler = () => setSettingsVersion((v) => v + 1)
    window.addEventListener('app:settings', handler as any)
    return () => window.removeEventListener('app:settings', handler as any)
  }, [])

  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_600px_at_10%_-10%,hsl(var(--primary)/.08),transparent),_radial-gradient(900px_500px_at_90%_-20%,hsl(var(--secondary)/.08),transparent)] p-2 sm:p-4">
      <div className="mx-auto max-w-[1400px] rounded-2xl border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/80 shadow-sm grid grid-cols-[240px_1fr] min-h-[calc(100vh-16px)]">
        {/* Sidebar (sticky, no inner scrollbars) */}
      <aside className="hidden md:flex flex-col border-r bg-background/60 backdrop-blur-sm sticky top-0 z-30 h-screen">
        <div className="h-14 border-b px-4 flex items-center gap-2">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              <AppIcon name="brand" size={18} fallback={<IconBrand size={18} />} />
            </span>
            <span>FlowTrack</span>
          </Link>
        </div>
        {user && (
          <nav className="p-3 space-y-1">
            <NavItem to="/dashboard" label="Dashboard" icon={IconDashboard} iconName="dashboard" />
            <NavItem to="/transactions" label="Transactions" icon={IconTransactions} iconName="transactions" />
            <NavItem to="/transfers" label="Transfers" icon={IconTransfers} iconName="transfers" />
            <NavItem to="/inventory" label="Inventory" icon={IconCategories} iconName="categories" />
            <NavItem to="/accounts" label="Accounts" icon={IconAccounts} iconName="accounts" />
            <NavItem to="/categories" label="Categories" icon={IconCategories} iconName="categories" />
            <NavItem to="/construction" label="Construction Work" icon={IconCategories} iconName="categories" />
            <NavItem to="/construction/price-analysis" label="Price Analysis" icon={IconReports} iconName="reports" />
            <NavItem to="/parties" label="Parties" icon={IconParties} iconName="parties" />
            <NavItem to="/reports" label="Reports" icon={IconReports} iconName="reports" />
            <NavItem to="/reports/vat" label="VAT Auditor Report" icon={IconReports} iconName="reports" />
            <NavItem to="/staff" label="Staff" icon={IconAccounts} iconName="staff" />
            <NavItem to="/staff/attendance" label="Attendance" icon={IconReports} iconName="attendance" />
            <NavItem to="/staff/attendance-report" label="Attendance report" icon={IconReports} iconName="reports" />
            <NavItem to="/invoice" label="Invoice" icon={IconAccounts} iconName="invoice" />
          </nav>
        )}
        <div className="mt-auto p-3 text-xs text-muted-foreground">Ac {new Date().getFullYear()}</div>
        </aside>

        {/* Mobile Menu (overlay) */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 md:hidden" onClick={() => setMobileMenuOpen(false)}>
            <div className="fixed inset-y-0 left-0 w-64 bg-background border-r shadow-lg" onClick={(e) => e.stopPropagation()}>
              <div className="h-14 border-b px-4 flex items-center justify-between">
                <Link to="/" className="flex items-center gap-2 font-semibold" onClick={() => setMobileMenuOpen(false)}>
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <AppIcon name="brand" size={18} fallback={<IconBrand size={18} />} />
                  </span>
                  <span>FlowTrack</span>
                </Link>
                <button onClick={() => setMobileMenuOpen(false)} className="p-2">×</button>
              </div>
              {user && (
                <nav className="p-3 space-y-1">
                  <NavItem to="/dashboard" label="Dashboard" icon={IconDashboard} iconName="dashboard" />
                  <NavItem to="/transactions" label="Transactions" icon={IconTransactions} iconName="transactions" />
                  <NavItem to="/transfers" label="Transfers" icon={IconTransfers} iconName="transfers" />
                  <NavItem to="/inventory" label="Inventory" icon={IconCategories} iconName="categories" />
                  <NavItem to="/accounts" label="Accounts" icon={IconAccounts} iconName="accounts" />
                  <NavItem to="/categories" label="Categories" icon={IconCategories} iconName="categories" />
                  <NavItem to="/construction" label="Construction Work" icon={IconCategories} iconName="categories" />
                  <NavItem to="/construction/price-analysis" label="Price Analysis" icon={IconReports} iconName="reports" />
                  <NavItem to="/parties" label="Parties" icon={IconParties} iconName="parties" />
                  <NavItem to="/reports" label="Reports" icon={IconReports} iconName="reports" />
                  <NavItem to="/reports/vat" label="VAT Auditor Report" icon={IconReports} iconName="reports" />
                  <NavItem to="/staff" label="Staff" icon={IconAccounts} iconName="staff" />
                  <NavItem to="/staff/attendance" label="Attendance" icon={IconReports} iconName="attendance" />
                  <NavItem to="/staff/attendance-report" label="Attendance report" icon={IconReports} iconName="reports" />
                  <NavItem to="/invoice" label="Invoice" icon={IconAccounts} iconName="invoice" />
                </nav>
              )}
            </div>
          </div>
        )}

        {/* Content */}
        {/* Content column (window scroll only) */}
        <div className="flex min-h-full flex-col">
          {/* Topbar */}
          <header className="h-14 border-b bg-background/60 backdrop-blur-sm flex items-center justify-between px-4 sticky top-0 z-40 shadow-sm">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 rounded-md hover:bg-muted"
              aria-label="Open menu"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          <div className="flex items-center gap-2 w-full max-w-xl">
            <div className="flex w-full items-center gap-2">
              <input
                className="h-10 flex-1 rounded-full bg-muted border-0 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground"
                placeholder="Search anything..."
                value={globalSearch}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    try { window.dispatchEvent(new CustomEvent('app:search', { detail: { query: globalSearch } })) } catch {}
                  }
                }}
                onChange={(e) => {
                  const q = e.target.value
                  setGlobalSearch(q)
                  try { window.dispatchEvent(new CustomEvent('app:search', { detail: { query: q } })) } catch {}
                }}
              />
              {globalSearch && (
                <button
                  type="button"
                  aria-label="Clear search"
                  className="h-10 px-3 rounded-md bg-white border text-xs hover:bg-muted"
                  onClick={() => {
                    setGlobalSearch('')
                    try { window.dispatchEvent(new CustomEvent('app:search', { detail: { query: '' } })) } catch {}
                  }}
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                aria-label="Search"
                className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-xs hover:opacity-90"
                onClick={() => {
                  try { window.dispatchEvent(new CustomEvent('app:search', { detail: { query: globalSearch } })) } catch {}
                }}
              >
                Search
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <InventoryNotificationBell />
                <div title={user.email ?? ''} className="hidden md:flex items-center gap-2 pr-2 text-sm text-muted-foreground">
                  <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center font-medium text-foreground">
                    {(user.email ?? 'U').charAt(0).toUpperCase()}
                  </div>
                  <span className="max-w-[12rem] truncate">{user.email}</span>
                </div>
                <SettingsDialog />
                <Button
                  variant="outline"
                  onClick={async () => {
                    await supabase.auth.signOut()
                  }}
                >
                  <IconSignOut className="mr-2" size={16} /> Sign out
                </Button>
              </>
            ) : (
              <Button asChild>
                <Link to="/login">Sign in</Link>
              </Button>
            )}
          </div>
        </header>
        <main className="px-4 sm:px-6 lg:px-8 py-6">
          <Outlet />
        </main>
      </div>
      </div>
    </div>
  )
}

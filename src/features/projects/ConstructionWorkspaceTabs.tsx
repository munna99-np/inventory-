import { NavLink } from 'react-router-dom'

import { cn } from '../../lib/utils'

type ConstructionWorkspaceTabsProps = {
  active: 'projects' | 'price-analysis'
}

const tabs = [
  { key: 'projects', label: 'Project profiles', to: '/construction' },
  { key: 'price-analysis', label: 'Price analysis', to: '/construction/price-analysis' },
]

export function ConstructionWorkspaceTabs({ active }: ConstructionWorkspaceTabsProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="space-y-1">
        <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground/70">Construction workspace</p>
        <h1 className="text-2xl font-semibold text-foreground">
          {active === 'projects' ? 'Project portfolio' : 'Price analysis register'}
        </h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          {active === 'projects'
            ? 'Switch between portfolio management and detailed rate analysis without leaving the construction cockpit.'
            : 'Build a rate library with aligned quantities, units, and pricing that your site teams can trust.'}
        </p>
      </div>
      <div className="flex h-12 items-center gap-1 rounded-full border border-border/60 bg-card/80 p-1 shadow-sm">
        {tabs.map((tab) => (
          <NavLink
            key={tab.key}
            to={tab.to}
            className={({ isActive }) =>
              cn(
                'inline-flex h-10 items-center rounded-full px-4 text-sm font-medium transition',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
    </div>
  )
}


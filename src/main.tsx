import './index.css'
import { applyTheme } from './lib/settings'
import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, createHashRouter, RouterProvider } from 'react-router-dom'
import { Toaster } from 'sonner'

import { AuthProvider } from './lib/auth'
const AppLayout = lazy(() => import('./routes/AppLayout'))
const DashboardPage = lazy(() => import('./routes/DashboardPage'))
const SignInPage = lazy(() => import('./routes/SignInPage'))
const TransactionsPage = lazy(() => import('./routes/TransactionsPage'))
const TransactionHistoryPage = lazy(() => import('./routes/TransactionHistoryPage'))
const AccountsPage = lazy(() => import('./routes/AccountsPage'))
const AccountStatementPage = lazy(() => import('./routes/AccountStatementPage'))
const CategoriesPage = lazy(() => import('./routes/CategoriesPage'))
const PartiesPage = lazy(() => import('./routes/PartiesPage'))
const ReportsPage = lazy(() => import('./routes/ReportsPage'))
const VATAuditorReportPage = lazy(() => import('./routes/VATAuditorReportPage'))
const TransfersPage = lazy(() => import('./routes/TransfersPage'))
const StaffPage = lazy(() => import('./routes/StaffPage'))
const StaffAttendancePage = lazy(() => import('./routes/StaffAttendancePage'))
const StaffAttendanceReportPage = lazy(() => import('./routes/StaffAttendanceReportPage'))
const InventoryPage = lazy(() => import('./routes/InventoryPage'))
const InventoryItemsPage = lazy(() => import('./routes/InventoryItemsPage'))
const InventoryCategoriesPage = lazy(() => import('./routes/InventoryCategoriesPage'))
const InventoryPurchasesPage = lazy(() => import('./routes/InventoryPurchasesPage'))
const InventoryReportsPage = lazy(() => import('./routes/InventoryReportsPage'))
const InventoryStockPage = lazy(() => import('./routes/InventoryStockPage'))
const ConstructionProjectsPage = lazy(() => import('./routes/ConstructionProjectsPage'))
const ConstructionProjectDetailPage = lazy(() => import('./routes/ConstructionProjectDetailPage'))
const ConstructionProjectStatementPage = lazy(() => import('./routes/ConstructionProjectStatementPage'))
const ConstructionProjectOverviewPage = lazy(() => import('./routes/ConstructionProjectOverviewPage'))
const ConstructionBankAccountsAddPage = lazy(() => import('./routes/ConstructionBankAccountsAddPage'))
const ConstructionBankAccountsPage = lazy(() => import('./routes/ConstructionBankAccountsPage'))
const ConstructionBankAccountStatementPage = lazy(() => import('./routes/ConstructionBankAccountStatementPage'))
const ConstructionPaymentInPage = lazy(() => import('./routes/ConstructionPaymentInPage'))
const ConstructionPaymentOutPage = lazy(() => import('./routes/ConstructionPaymentOutPage'))
const ConstructionTransferPage = lazy(() => import('./routes/ConstructionTransferPage'))
const ConstructionPlanningEstimationPromptPage = lazy(() => import('./routes/ConstructionPlanningEstimationPromptPage'))
const ConstructionProjectReportPage = lazy(() => import('./routes/ConstructionProjectReportPage'))
const ConstructionProjectReportDrilldownPage = lazy(() => import('./routes/ConstructionProjectReportDrilldownPage'))
const ConstructionPriceAnalysisPage = lazy(() => import('./routes/ConstructionPriceAnalysisPage'))
const CustomerStatementPage = lazy(() => import('./routes/CustomerStatementPage'))
const InvoicePage = lazy(() => import('./routes/InvoicePage'))
import { ErrorBoundary } from './components/ErrorBoundary'
import { ProtectedOutlet } from './lib/auth'

// Detect Electron environment
const isElectron = typeof window !== 'undefined' && 
  (window.process?.type === 'renderer' || (window.navigator as any)?.userAgent?.includes('Electron'))

// Use HashRouter for Electron (file:// protocol) or BrowserRouter for web
const createRouter = isElectron ? createHashRouter : createBrowserRouter

const router = createRouter([
  { 
    path: '/', 
    element: <SignInPage />,
    errorElement: <div className="min-h-screen flex items-center justify-center">Error loading page</div>,
  },
  { 
    path: '/signin', 
    element: <SignInPage />,
    errorElement: <div className="min-h-screen flex items-center justify-center">Error loading sign in</div>,
  },
  {
    element: <ProtectedOutlet />,
    children: [
      {
        path: '/',
        element: <AppLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'dashboard', element: <DashboardPage /> },
          { path: 'transactions', element: <TransactionsPage /> },
          { path: 'transactions/history', element: <TransactionHistoryPage /> },
          { path: 'transfers', element: <TransfersPage /> },
          { path: 'accounts', element: <AccountsPage /> },
          { path: 'accounts/:accountId', element: <AccountStatementPage /> },
          { path: 'categories', element: <CategoriesPage /> },
          { path: 'parties', element: <PartiesPage /> },
          { path: 'reports', element: <ReportsPage /> },
          { path: 'reports/vat', element: <VATAuditorReportPage /> },
          { path: 'staff', element: <StaffPage /> },
          { path: 'staff/attendance', element: <StaffAttendancePage /> },
          { path: 'staff/attendance-report', element: <StaffAttendanceReportPage /> },
          { path: 'invoice', element: <InvoicePage /> },
          { path: 'inventory', element: <InventoryPage /> },
          { path: 'inventory/stock', element: <InventoryStockPage /> },
          { path: 'inventory/items', element: <InventoryItemsPage /> },
          { path: 'inventory/categories', element: <InventoryCategoriesPage /> },
          { path: 'inventory/purchases', element: <InventoryPurchasesPage /> },
          { path: 'inventory/reports', element: <InventoryReportsPage /> },
          { path: 'inventory/customers/:partyId', element: <CustomerStatementPage /> },
          { path: 'construction', element: <ConstructionProjectsPage /> },
          { path: 'construction/price-analysis', element: <ConstructionPriceAnalysisPage /> },
          { path: 'construction/:projectId', element: <ConstructionProjectDetailPage /> },
          { path: 'construction/:projectId/overview', element: <ConstructionProjectOverviewPage /> },
          { path: 'construction/:projectId/bank-accounts', element: <ConstructionBankAccountsPage /> },
          { path: 'construction/:projectId/bank-accounts/new', element: <ConstructionBankAccountsAddPage /> },
          { path: 'construction/:projectId/accounts/:accountId', element: <ConstructionBankAccountStatementPage /> },
          { path: 'construction/:projectId/payments/in', element: <ConstructionPaymentInPage /> },
          { path: 'construction/:projectId/payments/out', element: <ConstructionPaymentOutPage /> },
          { path: 'construction/:projectId/payments/transfer', element: <ConstructionTransferPage /> },
          { path: 'construction/:projectId/statement', element: <ConstructionProjectStatementPage /> },
          { path: 'construction/:projectId/report', element: <ConstructionProjectReportPage /> },
          { path: 'construction/:projectId/report/drilldown', element: <ConstructionProjectReportDrilldownPage /> },
          { path: 'construction/:projectId/planning-estimation', element: <ConstructionPlanningEstimationPromptPage /> },
        ],
      },
    ],
  },
])

// Apply persisted theme before rendering
try { applyTheme() } catch {}

// Handle Electron context
if (isElectron) {
  // Ensure proper initialization and fix any localStorage issues
  console.log('Running in Electron environment')
  // Fix for Electron file:// protocol issues
  try {
    if (!localStorage.getItem('app_locale')) {
      localStorage.setItem('app_locale', 'en-IN')
    }
    if (!localStorage.getItem('app_currency')) {
      localStorage.setItem('app_currency', 'INR')
    }
  } catch (e) {
    console.warn('Could not initialize localStorage:', e)
  }
}

// Initialize offline storage and sync service
if (typeof window !== 'undefined') {
  import('./lib/offlineStorage').then(({ offlineStorage }) => {
    offlineStorage.init().catch((err) => {
      console.error('Failed to initialize offline storage:', err)
    })
  })

  import('./lib/syncService').then(({ syncService }) => {
    // Try initial sync if online
    if (syncService.isConnected()) {
      syncService.sync().catch((err) => {
        console.error('Initial sync failed:', err)
      })
    }
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <ErrorBoundary>
        <Suspense
          fallback={
            <div className="min-h-[50vh] grid place-items-center text-sm text-muted-foreground">
              Loading...
            </div>
          }
        >
          <RouterProvider router={router} />
        </Suspense>
      </ErrorBoundary>
      <Toaster richColors position="top-right" />
    </AuthProvider>
  </StrictMode>
)









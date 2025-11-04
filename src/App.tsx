import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, useRoutes } from 'react-router-dom'
import { Toaster } from 'sonner'

import { ErrorBoundary } from './components/ErrorBoundary'
import ProtectedRoute from './components/ProtectedRoute'
import { AuthProvider } from './providers/AuthProvider'

const Login = lazy(() => import('./routes/SignInPage'))
const AppLayout = lazy(() => import('./routes/AppLayout'))
const DashboardPage = lazy(() => import('./routes/DashboardPage'))
const TransactionsPage = lazy(() => import('./routes/TransactionsPage'))
const TransactionHistoryPage = lazy(() => import('./routes/TransactionHistoryPage'))
const TransfersPage = lazy(() => import('./routes/TransfersPage'))
const AccountsPage = lazy(() => import('./routes/AccountsPage'))
const AccountStatementPage = lazy(() => import('./routes/AccountStatementPage'))
const CategoriesPage = lazy(() => import('./routes/CategoriesPage'))
const PartiesPage = lazy(() => import('./routes/PartiesPage'))
const ReportsPage = lazy(() => import('./routes/ReportsPage'))
const VATAuditorReportPage = lazy(() => import('./routes/VATAuditorReportPage'))
const StaffPage = lazy(() => import('./routes/StaffPage'))
const StaffAttendancePage = lazy(() => import('./routes/StaffAttendancePage'))
const StaffAttendanceReportPage = lazy(() => import('./routes/StaffAttendanceReportPage'))
const InvoicePage = lazy(() => import('./routes/InvoicePage'))
const InventoryPage = lazy(() => import('./routes/InventoryPage'))
const InventoryStockPage = lazy(() => import('./routes/InventoryStockPage'))
const InventoryItemsPage = lazy(() => import('./routes/InventoryItemsPage'))
const InventoryCategoriesPage = lazy(() => import('./routes/InventoryCategoriesPage'))
const InventoryPurchasesPage = lazy(() => import('./routes/InventoryPurchasesPage'))
const InventoryReportsPage = lazy(() => import('./routes/InventoryReportsPage'))
const CustomerStatementPage = lazy(() => import('./routes/CustomerStatementPage'))
const ConstructionProjectsPage = lazy(() => import('./routes/ConstructionProjectsPage'))
const ConstructionProjectDetailPage = lazy(() => import('./routes/ConstructionProjectDetailPage'))
const ConstructionProjectOverviewPage = lazy(() => import('./routes/ConstructionProjectOverviewPage'))
const ConstructionBankAccountsPage = lazy(() => import('./routes/ConstructionBankAccountsPage'))
const ConstructionBankAccountsAddPage = lazy(() => import('./routes/ConstructionBankAccountsAddPage'))
const ConstructionBankAccountStatementPage = lazy(() => import('./routes/ConstructionBankAccountStatementPage'))
const ConstructionPaymentInPage = lazy(() => import('./routes/ConstructionPaymentInPage'))
const ConstructionPaymentOutPage = lazy(() => import('./routes/ConstructionPaymentOutPage'))
const ConstructionTransferPage = lazy(() => import('./routes/ConstructionTransferPage'))
const ConstructionPlanningEstimationPromptPage = lazy(() => import('./routes/ConstructionPlanningEstimationPromptPage'))
const ConstructionProjectStatementPage = lazy(() => import('./routes/ConstructionProjectStatementPage'))
const ConstructionProjectReportPage = lazy(() => import('./routes/ConstructionProjectReportPage'))
const ConstructionProjectReportDrilldownPage = lazy(() => import('./routes/ConstructionProjectReportDrilldownPage'))
const ConstructionPriceAnalysisPage = lazy(() => import('./routes/ConstructionPriceAnalysisPage'))

function AppRoutes(): JSX.Element | null {
  return useRoutes([
    { path: '/login', element: <Login /> },
    { path: '/signin', element: <Login /> },
    {
      path: '/',
      element: (
        <ProtectedRoute>
          <AppLayout />
        </ProtectedRoute>
      ),
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
        { path: 'construction/:projectId/planning-estimation', element: <ConstructionPlanningEstimationPromptPage /> },
        { path: 'construction/:projectId/statement', element: <ConstructionProjectStatementPage /> },
        { path: 'construction/:projectId/report', element: <ConstructionProjectReportPage /> },
        { path: 'construction/:projectId/report/drilldown', element: <ConstructionProjectReportDrilldownPage /> },
        { path: '*', element: <Navigate to="/dashboard" replace /> },
      ],
    },
    { path: '*', element: <Navigate to="/dashboard" replace /> },
  ])
}

export default function App(): JSX.Element {
  return (
    <BrowserRouter>
      <AuthProvider>
        <>
          <ErrorBoundary>
            <Suspense
              fallback={
                <div className="min-h-[50vh] grid place-items-center text-sm text-muted-foreground">
                  Loading...
                </div>
              }
            >
              <AppRoutes />
            </Suspense>
          </ErrorBoundary>
          <Toaster richColors position="top-right" />
        </>
      </AuthProvider>
    </BrowserRouter>
  )
}

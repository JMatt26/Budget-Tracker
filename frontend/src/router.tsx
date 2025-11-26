import {
    Routes,
    Route,
    Navigate,
    useLocation,
  } from "react-router-dom";
  
  import { AppLayout } from "./components/layout/AppLayout";
  import { DashboardPage } from "./features/dashboard/DashboardPage";
  import { TransactionsPage } from "./features/transactions/TransactionsPage";
import { BudgetsPage } from "./features/budgets/BudgetsPage";
  import { CategoriesPage } from "./features/categories/CategoriesPage";
  import { ReportsPage } from "./features/reports/ReportsPage";
import { BudgetDetailPage } from "./features/budgets/BudgetDetailPage";
  import { LoginPage } from "./features/auth/LoginPage";
  import { RegisterPage } from "./features/auth/RegisterPage";
  import { useAuth } from "./lib/auth";
import React from "react";
  
  const PrivateRoute = ({ children }: { children: JSX.Element }) => {
    const { token } = useAuth();
    const location = useLocation();
  
    if (!token) {
      return <Navigate to="/login" state={{ from: location }} replace />;
    }
  
    return children;
  };
  
  export const RouterProvider = () => {
    return (
      <Routes>
        <Route
          path="/login"
          element={<LoginPage />}
        />
        <Route
          path="/register"
          element={<RegisterPage />}
        />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <AppLayout />
            </PrivateRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="transactions" element={<TransactionsPage />} />
          <Route path="budgets" element={<BudgetsPage />} />
          <Route path="budgets/:budgetId" element={<BudgetDetailPage />} />
          <Route path="categories" element={<CategoriesPage />} />
          <Route path="reports" element={<ReportsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  };
  
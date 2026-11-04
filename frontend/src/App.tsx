import { lazy } from "react";
import { Link, Route, Routes } from "react-router-dom";
import { EmptyState } from "./components/States";
import { AppSettingsProvider } from "./hooks/useAppSettings";
import { AppLayout } from "./layouts/AppLayout";

// Route-level code splitting keeps the initial bundle small (charts load with the dashboard).
const Dashboard = lazy(() => import("./pages/Dashboard"));
const UploadDocument = lazy(() => import("./pages/UploadDocument"));
const Documents = lazy(() => import("./pages/Documents"));
const History = lazy(() => import("./pages/History"));
const AnalysisResults = lazy(() => import("./pages/AnalysisResults"));
const About = lazy(() => import("./pages/About"));
const Settings = lazy(() => import("./pages/Settings"));

export default function App() {
  return (
    <AppSettingsProvider>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="analyze" element={<UploadDocument />} />
          <Route path="documents" element={<Documents />} />
          <Route path="history" element={<History />} />
          <Route path="analysis/:documentId" element={<AnalysisResults />} />
          <Route path="about" element={<About />} />
          <Route path="settings" element={<Settings />} />
          <Route
            path="*"
            element={
              <div className="card">
                <EmptyState
                  title="Page not found"
                  description="The page you are looking for does not exist."
                  action={
                    <Link to="/" className="btn-primary">
                      Back to dashboard
                    </Link>
                  }
                />
              </div>
            }
          />
        </Route>
      </Routes>
    </AppSettingsProvider>
  );
}

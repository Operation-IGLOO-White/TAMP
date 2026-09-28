import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Providers } from "@/context/Providers";
import { RequireRole } from "@/components/tamp/RequireRole";
import { Link } from "@/lib/nav";
const Page0 = lazy(() => import("@/pages/403"));
const Page1 = lazy(() => import("@/pages/admin/oversight"));
const Page2 = lazy(() => import("@/pages/admin/index"));
const Page3 = lazy(() => import("@/pages/admin/profile"));
const Page4 = lazy(() => import("@/pages/admin/trucks"));
const Page5 = lazy(() => import("@/pages/admin/users/$partyId"));
const Page6 = lazy(() => import("@/pages/admin/users/index"));
const Page7 = lazy(() => import("@/pages/driver/dashboard"));
const Page8 = lazy(() => import("@/pages/transporter/engagements"));
const Page9 = lazy(() => import("@/pages/transporter/fleet"));
const Page10 = lazy(() => import("@/pages/fleet-ops"));
const Page11 = lazy(() => import("@/pages/transporter/history"));
const Page12 = lazy(() => import("@/pages/driver/index"));
const Page13 = lazy(() => import("@/pages/driver/profile"));
const Page14 = lazy(() => import("@/pages/forgot-password"));
const Page15 = lazy(() => import("@/pages/notifications"));
const Page16 = lazy(() => import("@/pages/owner/board"));
const Page17 = lazy(() => import("@/pages/owner/history"));
const Page18 = lazy(() => import("@/pages/owner/loads/$loadId"));
const Page19 = lazy(() => import("@/pages/owner/index"));
const Page20 = lazy(() => import("@/pages/owner/profile"));
const Page21 = lazy(() => import("@/pages/index"));
const Page22 = lazy(() => import("@/pages/register"));
const Page23 = lazy(() => import("@/pages/track/$loadId"));
const Page24 = lazy(() => import("@/pages/transporter/engagements"));
const Page25 = lazy(() => import("@/pages/transporter/fleet"));
const Page26 = lazy(() => import("@/pages/fleet-ops"));
const Page27 = lazy(() => import("@/pages/transporter/history"));
const Page28 = lazy(() => import("@/pages/transporter/index"));
const Page29 = lazy(() => import("@/pages/transporter/profile"));
const Page30 = lazy(() => import("@/pages/trucks/$truckId"));
const Page31 = lazy(() => import("@/pages/welcome"));
const Page32 = lazy(() => import("@/pages/admin/logs"));

export default function App() {
  return (
    <BrowserRouter>
      <Providers>
        <Suspense
          fallback={
            <div role="status" className="p-8 text-muted-foreground">
              Loading…
            </div>
          }
        >
          <Routes>
            <Route path="/403" element={<Page0 />} />
            <Route
              path="/admin/oversight"
              element={
                <RequireRole role={"ADMIN"}>
                  <Page1 />
                </RequireRole>
              }
            />
            <Route
              path="/admin"
              element={
                <RequireRole role={"ADMIN"}>
                  <Page2 />
                </RequireRole>
              }
            />
            <Route
              path="/admin/profile"
              element={
                <RequireRole role={"ADMIN"}>
                  <Page3 />
                </RequireRole>
              }
            />
            <Route
              path="/admin/trucks"
              element={
                <RequireRole role={"ADMIN"}>
                  <Page4 />
                </RequireRole>
              }
            />
            <Route
              path="/admin/users/:partyId"
              element={
                <RequireRole role={"ADMIN"}>
                  <Page5 />
                </RequireRole>
              }
            />
            <Route
              path="/admin/users"
              element={
                <RequireRole role={"ADMIN"}>
                  <Page6 />
                </RequireRole>
              }
            />
            <Route
              path="/driver/dashboard"
              element={
                <RequireRole role={["TRANSPORTER", "DRIVER"]}>
                  <Page7 />
                </RequireRole>
              }
            />
            <Route
              path="/driver/engagements"
              element={
                <RequireRole role={["TRANSPORTER", "DRIVER"]}>
                  <Page8 />
                </RequireRole>
              }
            />
            <Route
              path="/driver/fleet"
              element={
                <RequireRole role={["TRANSPORTER", "DRIVER"]}>
                  <Page9 />
                </RequireRole>
              }
            />
            <Route
              path="/driver/fleet-ops"
              element={
                <RequireRole role={["TRANSPORTER", "DRIVER"]}>
                  <Page10 />
                </RequireRole>
              }
            />
            <Route
              path="/driver/history"
              element={
                <RequireRole role={["TRANSPORTER", "DRIVER"]}>
                  <Page11 />
                </RequireRole>
              }
            />
            <Route
              path="/driver"
              element={
                <RequireRole role={["TRANSPORTER", "DRIVER"]}>
                  <Page12 />
                </RequireRole>
              }
            />
            <Route
              path="/driver/profile"
              element={
                <RequireRole role={["TRANSPORTER", "DRIVER"]}>
                  <Page13 />
                </RequireRole>
              }
            />
            <Route path="/forgot-password" element={<Page14 />} />
            <Route path="/notifications" element={<Page15 />} />
            <Route
              path="/owner/board"
              element={
                <RequireRole role={"FREIGHT_OWNER"}>
                  <Page16 />
                </RequireRole>
              }
            />
            <Route
              path="/owner/history"
              element={
                <RequireRole role={"FREIGHT_OWNER"}>
                  <Page17 />
                </RequireRole>
              }
            />
            <Route
              path="/owner/loads/:loadId"
              element={
                <RequireRole role={"FREIGHT_OWNER"}>
                  <Page18 />
                </RequireRole>
              }
            />
            <Route
              path="/owner"
              element={
                <RequireRole role={"FREIGHT_OWNER"}>
                  <Page19 />
                </RequireRole>
              }
            />
            <Route
              path="/owner/profile"
              element={
                <RequireRole role={"FREIGHT_OWNER"}>
                  <Page20 />
                </RequireRole>
              }
            />
            <Route path="/" element={<Page21 />} />
            <Route path="/register" element={<Page22 />} />
            <Route path="/track/:loadId" element={<Page23 />} />
            <Route
              path="/transporter/engagements"
              element={
                <RequireRole role={"TRANSPORTER"}>
                  <Page24 />
                </RequireRole>
              }
            />
            <Route
              path="/transporter/fleet"
              element={
                <RequireRole role={"TRANSPORTER"}>
                  <Page25 />
                </RequireRole>
              }
            />
            <Route
              path="/transporter/fleet-ops"
              element={
                <RequireRole role={"TRANSPORTER"}>
                  <Page26 />
                </RequireRole>
              }
            />
            <Route
              path="/transporter/history"
              element={
                <RequireRole role={"TRANSPORTER"}>
                  <Page27 />
                </RequireRole>
              }
            />
            <Route
              path="/transporter"
              element={
                <RequireRole role={"TRANSPORTER"}>
                  <Page28 />
                </RequireRole>
              }
            />
            <Route
              path="/transporter/profile"
              element={
                <RequireRole role={"TRANSPORTER"}>
                  <Page29 />
                </RequireRole>
              }
            />
            <Route path="/trucks/:truckId" element={<Page30 />} />
            <Route path="/welcome" element={<Page31 />} />
            <Route
              path="/admin/logs"
              element={
                <RequireRole role={"ADMIN"}>
                  <Page32 />
                </RequireRole>
              }
            />
            <Route
              path="*"
              element={
                <main className="p-8">
                  <h1 className="text-2xl font-bold">Page not found</h1>
                  <Link to="/" className="underline">
                    Return home
                  </Link>
                </main>
              }
            />
          </Routes>
        </Suspense>
      </Providers>
    </BrowserRouter>
  );
}

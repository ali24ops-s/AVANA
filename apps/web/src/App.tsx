/**
 * App component (legacy entry point — now delegates to the router).
 *
 * Preserved for compatibility with existing tests.
 * The new application entry point is main.tsx with React Router.
 */

import { Outlet } from "react-router-dom";

export function App() {
  return <Outlet />;
}

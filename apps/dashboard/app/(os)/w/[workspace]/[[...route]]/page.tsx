/**
 * Every route of a workspace that has no page of its own yet: it draws nothing, and leaves the route to the frame's
 * legacy table (the layout above). A surface that moves to TSX takes its route off this page by having a `page.tsx`
 * of its own beside it, and its row leaves `pages/app-routes.jsx` in the same change (decision 0015).
 */
export default function RoutePage() {
  return null;
}

// The Console's own stylesheet, on its own route: no customer's page carries it.
import "@/surfaces/console/console.css";

/** The Console's frame (decision 0066): its page, prerendered once for every person, as the OS frame is. */
export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return children;
}

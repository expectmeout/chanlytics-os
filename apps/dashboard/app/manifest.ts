import type { MetadataRoute } from "next";
import { themeColorOf } from "@chanlytics/contracts";

/**
 * The installable shell.
 *
 * An owner runs this from the shop floor or between calls, on a phone. A home-screen icon
 * that opens full-screen is the difference between "the app" and "that tab
 * I had open". Served without a session (middleware lists it as public): it
 * names the product and its icons, nothing else.
 *
 * Its two colours are read before any page is: the splash an installed app opens on, and the bar the OS paints until
 * the page's own theme-color is read. Both are the paper of the dark theme the document stands in before its boot
 * script runs (layout.tsx), which is what a device that has chosen nothing opens in. They were a dark green-black
 * left over from the doors' old palette, which neither theme's page is, so every launch changed colour under the
 * member's thumb.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Chanlytics OS",
    short_name: "Chanlytics",
    description: "Your receptionist's inbox, calls and people, on your phone.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: themeColorOf("dark"),
    theme_color: themeColorOf("dark"),
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

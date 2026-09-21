import type { MetadataRoute } from "next";

/**
 * The installable shell.
 *
 * An owner runs this from the shop floor or between calls, on a phone. A home-screen icon
 * that opens full-screen is the difference between "the app" and "that tab
 * I had open". Served without a session (middleware lists it as public): it
 * names the product and its icons, nothing else.
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
    background_color: "#0e1512",
    theme_color: "#0e1512",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CampusClass",
    short_name: "CampusClass",
    description: "CampusClass academic workspace",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#f7f8f5",
    theme_color: "#1f5f4a",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}

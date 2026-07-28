import { createFileRoute } from "@tanstack/react-router";
import { AuthLayout } from "./login";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Start your studio · Voxdeck" },
      { name: "description", content: "Create a free Voxdeck studio and ship your first talking deck in minutes." },
    ],
  }),
  component: () => <AuthLayout mode="signup" />,
});

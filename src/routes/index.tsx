import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Neroxa Master | Panel interno" },
      { name: "description", content: "Panel interno de la plataforma Neroxa." },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/master" });
  },
});

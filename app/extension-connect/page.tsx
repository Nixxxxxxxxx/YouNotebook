import { redirect } from "next/navigation";

import { createSessionForUser } from "@/lib/auth/repository";
import { getCurrentUser } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ExtensionConnectPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const session = await createSessionForUser(user.id);

  return (
    <main
      data-quietly-extension-token={session.token}
      data-quietly-extension-email={user.email}
      style={{
        alignItems: "center",
        background: "#0d0d0d",
        color: "#f7f7f7",
        display: "grid",
        minHeight: "100svh",
        padding: 32,
        placeItems: "center",
      }}
    >
      <section
        style={{
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: 28,
          display: "grid",
          gap: 12,
          maxWidth: 460,
          padding: 28,
        }}
      >
        <p
          style={{
            color: "rgba(255, 255, 255, 0.56)",
            fontSize: 14,
            margin: 0,
          }}
        >
          Quietly extension
        </p>
        <h1
          style={{
            fontSize: 34,
            letterSpacing: "-0.05em",
            lineHeight: 1,
            margin: 0,
          }}
        >
          Подключаем расширение
        </h1>
        <p
          style={{
            color: "rgba(255, 255, 255, 0.64)",
            fontSize: 16,
            lineHeight: 1.45,
            margin: 0,
          }}
        >
          Если расширение установлено, оно сохранит доступ автоматически. После
          сообщения об успехе эту вкладку можно закрыть.
        </p>
        <p
          id="quietly-extension-connect-status"
          style={{
            color: "#9fceff",
            fontSize: 14,
            margin: "10px 0 0",
          }}
        >
          Ждём расширение…
        </p>
      </section>
    </main>
  );
}

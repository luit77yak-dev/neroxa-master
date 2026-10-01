import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

export function MasterLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setError("Não foi possível entrar. Verifique e-mail e senha.");
      setLoading(false);
      return;
    }

    window.location.reload();
  };

  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 px-5 py-10 text-slate-100">
      <Card className="w-full max-w-md border-white/10 bg-white/[0.06] p-7 text-white shadow-2xl">
        <div className="mb-7">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-white text-[#102a2e]">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Acesso interno</p>
          <h1 className="mt-1 text-2xl font-semibold">Neroxa Master</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Entre com a conta autorizada da plataforma Neroxa.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-300">E-mail</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="h-11 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-white/30"
              placeholder="seu@email.com"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-300">Senha</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="h-11 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-white/30"
              placeholder="••••••••"
            />
          </label>

          {error && <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-200">{error}</p>}

          <Button type="submit" disabled={loading} className="h-11 w-full bg-white text-[#102a2e] hover:bg-slate-100">
            {loading ? "Entrando..." : "Entrar no Master"}
          </Button>
        </form>
      </Card>
    </main>
  );
}

import { useEffect, useState } from "react";
import { ArrowLeft, KeyRound, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

export function MasterLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [mode, setMode] = useState<"login" | "reset">("login");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setRecoveryMode(true);
        setMode("login");
        clearFeedback();
      }
    });

    return () => data.subscription.unsubscribe();
  }, []);

  const clearFeedback = () => {
    setMessage(null);
    setError(null);
  };

  const handleUpdatePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    clearFeedback();

    if (newPassword.length < 8) {
      setError("A nova senha deve ter pelo menos 8 caracteres.");
      setLoading(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) {
      setError("Não foi possível atualizar a senha. Solicite um novo link e tente novamente.");
    } else {
      setMessage("Senha atualizada com sucesso. Agora você pode entrar no Neroxa Master.");
      setRecoveryMode(false);
      setPassword("");
      setNewPassword("");
    }
    setLoading(false);
  };

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    clearFeedback();

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

  const handleReset = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    clearFeedback();

    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      setError("Informe seu e-mail para receber o link de redefinição.");
      setLoading(false);
      return;
    }

    const redirectTo = "https://master.neroxa.ia.br/master";
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo,
    });

    if (resetError) {
      setError("Não foi possível enviar o link. Confira o e-mail e tente novamente.");
    } else {
      setMessage("Enviamos um link de redefinição para este e-mail. Verifique também a pasta de spam.");
    }

    setLoading(false);
  };

  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 px-5 py-10 text-slate-100">
      <Card className="w-full max-w-md border-white/10 bg-white/[0.06] p-7 text-white shadow-2xl">
        <div className="mb-7">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-white text-[#102a2e]">
            {mode === "login" ? <ShieldCheck className="h-5 w-5" /> : <KeyRound className="h-5 w-5" />}
          </div>
          <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
            Acesso interno
          </p>
          <h1 className="mt-1 text-2xl font-semibold">
            {mode === "login" ? "Neroxa Master" : "Redefinir senha"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            {mode === "login"
              ? "Entre com a conta autorizada da plataforma Neroxa."
              : "Informe seu e-mail e enviaremos um link seguro para criar uma nova senha."}
          </p>
        </div>

        {recoveryMode ? (
          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-300">Nova senha</span>
              <input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
                minLength={8}
                autoFocus
                className="h-11 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-white/30"
                placeholder="Mínimo de 8 caracteres"
              />
            </label>

            {error && <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-200">{error}</p>}
            {message && <p className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-200">{message}</p>}

            <Button type="submit" disabled={loading} className="h-11 w-full bg-white text-[#102a2e] hover:bg-slate-100">
              {loading ? "Atualizando..." : "Salvar nova senha"}
            </Button>
          </form>
        ) : {mode === "login" ? (
          <form onSubmit={handleLogin} className="space-y-4">
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
            {message && <p className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-200">{message}</p>}

            <Button type="submit" disabled={loading} className="h-11 w-full bg-white text-[#102a2e] hover:bg-slate-100">
              {loading ? "Entrando..." : "Entrar no Master"}
            </Button>

            <button
              type="button"
              onClick={() => {
                clearFeedback();
                setMode("reset");
              }}
              className="flex w-full items-center justify-center gap-2 text-sm text-slate-400 transition hover:text-white"
            >
              <Mail className="h-4 w-4" />
              Esqueci minha senha
            </button>
          </form>
        ) : (
          <form onSubmit={handleReset} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-300">E-mail</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoFocus
                className="h-11 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-white/30"
                placeholder="seu@email.com"
              />
            </label>

            {error && <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-200">{error}</p>}
            {message && <p className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-200">{message}</p>}

            <Button type="submit" disabled={loading} className="h-11 w-full bg-white text-[#102a2e] hover:bg-slate-100">
              {loading ? "Enviando..." : "Enviar link de redefinição"}
            </Button>

            <button
              type="button"
              onClick={() => {
                clearFeedback();
                setMode("login");
              }}
              className="flex w-full items-center justify-center gap-2 text-sm text-slate-400 transition hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar para o login
            </button>
          </form>
        )}
      </Card>
    </main>
  );
}

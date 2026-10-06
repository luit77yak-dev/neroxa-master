import { useEffect, useState } from "react";
import { ArrowLeft, KeyRound, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { isNeroxaStaff } from "@/features/master/clients/services";

async function isNeroxaStaffWithRetry() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const authorized = await isNeroxaStaff();
    if (authorized) return true;
    if (attempt < 2) await new Promise((resolve) => window.setTimeout(resolve, 300));
  }
  return false;
}

export function MasterLogin({ recoveryPage = false }: { recoveryPage?: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [authStep, setAuthStep] = useState<"credentials" | "mfa" | "enroll">("credentials");
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [enrollQrCode, setEnrollQrCode] = useState<string | null>(null);
  const [enrollSecret, setEnrollSecret] = useState<string | null>(null);
  const [recoveryMode, setRecoveryMode] = useState(recoveryPage);
  const [mode, setMode] = useState<"login" | "reset">(recoveryPage ? "reset" : "login");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const enterRecoveryMode = () => {
      setRecoveryMode(true);
      setMode("reset");
      clearFeedback();
    };

    const hasRecoveryHash = () => {
      const hash = window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : window.location.hash;
      return new URLSearchParams(hash).get("type") === "recovery";
    };

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || (event === "INITIAL_SESSION" && hasRecoveryHash())) {
        enterRecoveryMode();
      }
    });

    if (recoveryPage || hasRecoveryHash()) {
      enterRecoveryMode();
    }

    return () => data.subscription.unsubscribe();
  }, []);

  const clearFeedback = () => {
    setMessage(null);
    setError(null);
  };

  const finishMfa = () => {
    setMfaCode("");
    setMfaFactorId(null);
    setEnrollQrCode(null);
    setEnrollSecret(null);
    window.location.assign("/master");
  };

  const verifyFactor = async (factorId: string) => {
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError) throw challengeError;
    const { error: verifyError } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code: mfaCode.trim() });
    if (verifyError) throw verifyError;
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) throw error;
    if (data.currentLevel !== "aal2") throw new Error("O segundo fator não foi confirmado.");
  };

  const prepareMfaForSession = async () => {
    const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalError) throw aalError;
    if (aal.currentLevel === "aal2") {
      const authorized = await isNeroxaStaffWithRetry();
      if (!authorized) throw new Error("Sua conta não está autorizada no Neroxa Master.");
      finishMfa();
      return;
    }

    const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
    if (factorsError) throw factorsError;

    const verifiedTotp = factors.totp.find((factor) => factor.status === "verified");
    if (verifiedTotp) {
      setMfaFactorId(verifiedTotp.id);
      setAuthStep("mfa");
      return;
    }

    const pendingTotp = factors.totp.find((factor) => factor.status === "unverified");
    if (pendingTotp) await supabase.auth.mfa.unenroll({ factorId: pendingTotp.id });

    const { data: enrollment, error: enrollmentError } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Neroxa Master",
    });
    if (enrollmentError) throw enrollmentError;

    setMfaFactorId(enrollment.id);
    setEnrollQrCode(enrollment.totp.qr_code);
    setEnrollSecret(enrollment.totp.secret);
    setAuthStep("enroll");
  };

  useEffect(() => {
    if (recoveryMode) return;

    let active = true;
    void (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!active || !sessionData.session) return;

      try {
        await prepareMfaForSession();
      } catch (cause) {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Não foi possível preparar a autenticação em dois fatores.");
      }
    })();

    return () => {
      active = false;
    };
  }, [recoveryMode]);

  const handleUpdatePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    clearFeedback();

    if (newPassword.length < 8) {
      setError("A nova senha deve ter pelo menos 8 caracteres.");
      setLoading(false);
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const recoveryEmail = sessionData.session?.user?.email;

    if (!recoveryEmail) {
      setError("A sessão de recuperação não está mais disponível. Solicite um novo link.");
      setLoading(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) {
      setError("Não foi possível atualizar a senha. Solicite um novo link e tente novamente.");
      setLoading(false);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: recoveryEmail,
      password: newPassword,
    });

    if (signInError) {
      setError("A senha foi atualizada, mas não foi possível iniciar sua sessão automaticamente. Entre novamente com a nova senha.");
      setRecoveryMode(false);
      setMode("login");
      setPassword("");
      setNewPassword("");
      setEmail(recoveryEmail);
      setLoading(false);
      return;
    }

    setMessage("Senha atualizada com sucesso. Entrando no Neroxa Master...");
    setNewPassword("");
    window.location.assign("/master");
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

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      setError("Login realizado, mas a sessão não foi persistida. Tente novamente.");
      setLoading(false);
      return;
    }

    try {
      await prepareMfaForSession();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível preparar a autenticação em dois fatores.");
      await supabase.auth.signOut();
    } finally {
      setLoading(false);
    }
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

    const redirectTo = "https://master.neroxa.ia.br/master-recovery";
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

  if (authStep === "mfa" || authStep === "enroll") {
    const enrolling = authStep === "enroll";
    const submitMfa = async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setLoading(true);
      clearFeedback();
      if (!mfaFactorId || !/^\d{6}$/.test(mfaCode.trim())) {
        setError("Informe o código de 6 dígitos.");
        setLoading(false);
        return;
      }
      try {
        await verifyFactor(mfaFactorId);
        const authorized = await isNeroxaStaffWithRetry();
        if (!authorized) throw new Error("Sua conta não está autorizada no Neroxa Master.");
        finishMfa();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Não foi possível confirmar o segundo fator.");
        setLoading(false);
      }
    };

    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 px-5 py-10 text-slate-100">
        <Card className="w-full max-w-md border-white/10 bg-white/[0.06] p-7 text-white shadow-2xl">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-white text-[#102a2e]"><ShieldCheck className="h-5 w-5" /></div>
          <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Segurança do Master</p>
          <h1 className="mt-1 text-2xl font-semibold">{enrolling ? "Configure seu autenticador" : "Confirme seu acesso"}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">{enrolling ? "O Neroxa Master exige autenticação em dois fatores. Escaneie o QR Code com um aplicativo autenticador compatível." : "Abra seu aplicativo autenticador e informe o código atual de 6 dígitos."}</p>
          {enrolling && enrollQrCode && <div className="mt-5 flex justify-center rounded-xl bg-white p-4"><img src={enrollQrCode} alt="QR Code para configurar o autenticador" className="h-52 w-52" /></div>}
          {enrolling && enrollSecret && <details className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-slate-300"><summary className="cursor-pointer font-medium text-white">Não consigo escanear o QR Code</summary><p className="mt-2 break-all font-mono text-[11px] text-slate-400">{enrollSecret}</p></details>}
          <form onSubmit={submitMfa} className="mt-5 space-y-4">
            <label className="block"><span className="mb-1.5 block text-xs font-medium text-slate-300">Código de 6 dígitos</span><input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\\D/g, "").slice(0, 6))} required autoFocus className="h-12 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-center font-mono text-lg tracking-[0.35em] text-white outline-none focus:border-white/30" placeholder="000000" /></label>
            {error && <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-200">{error}</p>}
            <Button type="submit" disabled={loading} className="h-11 w-full bg-white text-[#102a2e] hover:bg-slate-100">{loading ? "Verificando..." : enrolling ? "Ativar autenticação" : "Confirmar acesso"}</Button>
            <button type="button" onClick={async () => { await supabase.auth.signOut(); window.location.assign("/master"); }} className="flex w-full items-center justify-center gap-2 text-sm text-slate-400 transition hover:text-white"><ArrowLeft className="h-4 w-4" />Cancelar e sair</button>
          </form>
        </Card>
      </main>
    );
  }

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
            {recoveryMode
              ? "Crie uma nova senha segura para recuperar o acesso ao Neroxa Master."
              : mode === "login"
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
        ) : mode === "login" ? (
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

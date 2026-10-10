"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

type AuthMode = "login" | "signup";

const supabase = createClient();

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const isSignUp = mode === "signup";

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError("");
    setMessage("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (isSignUp && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 6) {
      setError("Use a password with at least 6 characters.");
      return;
    }

    setIsLoading(true);

    if (isSignUp) {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: name.trim() || undefined },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (signUpError) {
        setError(signUpError.message);
      } else if (data.session) {
        router.push("/");
        router.refresh();
      } else {
        setMessage("Your account was created. You can now log in with your email and password.");
      }
    } else {
      const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });

      if (loginError) {
        setError("That email and password combination could not be verified.");
      } else {
        router.push("/");
        router.refresh();
      }
    }

    setIsLoading(false);
  }

  return (
    <main className="min-h-screen bg-[#f7f7f5] px-5 py-6 text-[#111111] sm:px-8 sm:py-10">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl flex-col">
        <header className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3" aria-label="StudyPal home">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#111111] text-lg font-bold text-white">S</span>
            <span className="text-lg font-bold tracking-tight">StudyPal</span>
          </Link>
          <p className="text-sm text-black/50">A calmer way to study.</p>
        </header>

        <section className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-[430px]">
            <div className="mb-8 text-center">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-[#d94b45]">Welcome back</p>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{isSignUp ? "Make space to learn." : "Good to see you."}</h1>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-black/55">{isSignUp ? "Create your StudyPal account and make your next study session count." : "Log in to pick up where you left off."}</p>
            </div>

            <div className="rounded-[28px] border border-black/10 bg-white p-6 shadow-[0_18px_50px_rgba(17,17,17,0.06)] sm:p-8">
              <div className="mb-7 grid grid-cols-2 rounded-xl bg-[#f1f1ef] p-1" role="tablist" aria-label="Authentication mode">
                <button type="button" role="tab" aria-selected={!isSignUp} onClick={() => switchMode("login")} className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition ${!isSignUp ? "bg-white text-black shadow-sm" : "text-black/45"}`}>Log in</button>
                <button type="button" role="tab" aria-selected={isSignUp} onClick={() => switchMode("signup")} className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition ${isSignUp ? "bg-white text-black shadow-sm" : "text-black/45"}`}>Sign up</button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {isSignUp && <label className="block"><span className="mb-2 block text-sm font-semibold">Name <span className="font-normal text-black/35">(optional)</span></span><input value={name} onChange={(event) => setName(event.target.value)} name="name" type="text" autoComplete="name" placeholder="What should we call you?" className="auth-input" /></label>}
                <label className="block"><span className="mb-2 block text-sm font-semibold">Email</span><input required value={email} onChange={(event) => setEmail(event.target.value)} name="email" type="email" autoComplete="email" placeholder="you@example.com" className="auth-input" /></label>
                <label className="block"><span className="mb-2 block text-sm font-semibold">Password</span><input required value={password} onChange={(event) => setPassword(event.target.value)} name="password" type="password" autoComplete={isSignUp ? "new-password" : "current-password"} placeholder="At least 6 characters" className="auth-input" /></label>
                {isSignUp && <label className="block"><span className="mb-2 block text-sm font-semibold">Confirm password</span><input required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} name="confirm-password" type="password" autoComplete="new-password" placeholder="Type it again" className="auth-input" /></label>}

                {error && <p role="alert" className="rounded-xl bg-[#fff0ef] px-3 py-2.5 text-sm leading-5 text-[#a8322d]">{error}</p>}
                {message && <p role="status" className="rounded-xl bg-[#fff0ef] px-3 py-2.5 text-sm leading-5 text-[#a8322d]">{message}</p>}

                <button disabled={isLoading} type="submit" className="w-full rounded-xl bg-[#d94b45] px-4 py-3.5 text-sm font-bold text-white transition hover:bg-[#bd3e39] focus:outline-none focus:ring-2 focus:ring-[#d94b45] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">{isLoading ? "One moment…" : isSignUp ? "Create account" : "Log in"}</button>
              </form>

              <p className="mt-6 text-center text-xs leading-5 text-black/45">By continuing, you agree to use StudyPal as a supportive space for learning.</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

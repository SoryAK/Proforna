"use client";

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
  const defaultTab = searchParams.get("tab") === "register" ? "register" : "signin";

  const [tab, setTab] = useState<"signin" | "register">(defaultTab);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (tab === "register") {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Registration failed");
        setLoading(false);
        return;
      }
    }

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError(tab === "register" ? "Account created but sign-in failed. Try signing in." : "Invalid email or password");
      if (tab === "register") setTab("signin");
      return;
    }

    router.push(tab === "register" ? "/onboarding" : callbackUrl);
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0514] text-slate-100 font-sans selection:bg-orange-500/30 overflow-hidden relative px-4">
      {/* Global Background Texture */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:32px_32px]" />
        <div className="absolute inset-0 opacity-[0.03] mix-blend-overlay" style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.8%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E')" }}></div>
      </div>

      {/* Animated Folder Background */}
      <div className="absolute inset-0 pointer-events-none z-0 flex items-center justify-center overflow-hidden">
        {/* Glowing Orbs */}
        <div className="absolute top-1/3 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-orange-500/20 rounded-full blur-[100px] opacity-50" />
        <div className="absolute bottom-1/3 right-1/4 translate-x-1/4 w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[100px] opacity-40" />
        
        {/* 3D Animated Folder */}
        <div className="relative w-[350px] h-[250px] sm:w-[700px] sm:h-[450px] md:opacity-80 transform scale-125 sm:scale-150 rotate-[-15deg]" style={{ perspective: '2000px' }}>
          <style dangerouslySetInnerHTML={{ __html: `
            @keyframes open-folder {
              0%, 100% { transform: rotateX(0deg); }
              50% { transform: rotateX(-60deg); }
            }
            @keyframes slide-paper-1 {
              0%, 100% { transform: translateY(0) rotate(0deg); }
              50% { transform: translateY(-70px) rotate(-3deg); }
            }
            @keyframes slide-paper-2 {
              0%, 100% { transform: translateY(0) rotate(0deg); }
              50% { transform: translateY(-110px) rotate(4deg); }
            }
            @keyframes slide-paper-3 {
              0%, 100% { transform: translateY(0) rotate(0deg); }
              50% { transform: translateY(-150px) rotate(-1deg); }
            }
            .folder-front {
              transform-origin: bottom;
              animation: open-folder 8s ease-in-out infinite;
            }
            .paper-1 { transform-origin: bottom center; animation: slide-paper-1 8s ease-in-out infinite; }
            .paper-2 { transform-origin: bottom center; animation: slide-paper-2 8s ease-in-out infinite; }
            .paper-3 { transform-origin: bottom center; animation: slide-paper-3 8s ease-in-out infinite; }
          `}} />
          
          {/* Back Cover */}
          <div className="absolute bottom-0 left-0 w-full h-full bg-gradient-to-tr from-orange-600 to-pink-700 rounded-xl rounded-tr-[4rem] shadow-[0_20px_60px_rgba(245,130,32,0.4)] border border-orange-400/30" />
          {/* Folder Tab */}
          <div className="absolute -top-10 sm:-top-12 left-8 w-[30%] h-16 bg-orange-600 rounded-t-xl" />
          
          {/* Documents */}
          <div className="absolute bottom-2 left-6 right-6 h-[95%] bg-white/80 rounded-lg shadow-md paper-1 border border-white/50 backdrop-blur-sm" style={{ animationDelay: '0.1s' }} />
          <div className="absolute bottom-3 left-5 right-5 h-[95%] bg-slate-100/90 rounded-lg shadow-md paper-2 border border-white/50 backdrop-blur-sm" style={{ animationDelay: '0.2s' }} />
          <div className="absolute bottom-4 left-4 right-4 h-[95%] bg-gradient-to-b from-white to-slate-200 rounded-lg shadow-xl paper-3 border-2 border-white flex flex-col p-8 sm:p-12 gap-5" style={{ animationDelay: '0.3s' }}>
             <div className="w-1/2 h-8 bg-slate-200 rounded-md" />
             <div className="w-full h-5 bg-slate-100 rounded-md" />
             <div className="w-5/6 h-5 bg-slate-100 rounded-md" />
             <div className="w-4/6 h-5 bg-slate-100 rounded-md" />
             <div className="w-full h-32 bg-gradient-to-r from-orange-100 to-pink-100 rounded-xl mt-6 border border-orange-200 flex items-end p-4">
                <div className="w-1/3 h-1/2 bg-orange-300 rounded-t-sm mx-1 opacity-50" />
                <div className="w-1/3 h-3/4 bg-pink-300 rounded-t-sm mx-1 opacity-50" />
                <div className="w-1/3 h-full bg-purple-300 rounded-t-sm mx-1 opacity-50" />
             </div>
          </div>
          
          {/* Front Cover */}
          <div className="absolute bottom-0 left-0 w-full h-[90%] bg-gradient-to-br from-orange-500/90 to-pink-600/90 rounded-xl shadow-[0_-20px_50px_rgba(0,0,0,0.5)] folder-front border-t border-r border-white/30 backdrop-blur-md" />
        </div>
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="mb-8 text-center drop-shadow-2xl">
          <Link href="/" className="inline-flex items-center gap-2">
            <Image src="/logo-icon.png" alt="Resumsify" width={48} height={48} className="rounded-xl shadow-[0_0_20px_rgba(245,130,32,0.4)]" />
            <span className="text-3xl font-bold text-white tracking-tight">
              Resumsify
            </span>
          </Link>
          <p className="mt-4 text-slate-300 font-medium tracking-wide">
            Your Career, In Your Hands
          </p>
        </div>

        <Card className="bg-[#120a24]/70 backdrop-blur-2xl border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] text-slate-100">
          <CardHeader className="pb-6">
            {/* Tab toggle */}
            <div className="flex rounded-xl bg-[#0a0514]/80 p-1.5 border border-white/5">
              <button
                type="button"
                onClick={() => { setTab("signin"); setError(""); }}
                className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all ${
                  tab === "signin"
                    ? "bg-gradient-to-r from-orange-500 to-pink-600 shadow-lg text-white"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setTab("register"); setError(""); }}
                className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all ${
                  tab === "register"
                    ? "bg-gradient-to-r from-pink-600 to-purple-600 shadow-lg text-white"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                Create Account
              </button>
            </div>
          </CardHeader>
          <CardContent>
            {/* OAuth */}
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2 bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 text-white h-12 rounded-xl transition-all"
              onClick={() => signIn("google", { callbackUrl })}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Continue with Google
            </Button>

            <div className="relative my-8">
              <Separator className="bg-white/10" />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#120a24] px-4 text-xs font-medium text-slate-400 border border-white/5 rounded-full py-1">
                OR
              </span>
            </div>

            {/* Form */}
            <form onSubmit={handleCredentials} className="space-y-5">
              {tab === "register" && (
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-slate-300">Full Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="John Doe"
                    className="bg-black/20 border-white/10 text-white placeholder-slate-500 focus:border-orange-500/50 h-12"
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-slate-300">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="bg-black/20 border-white/10 text-white placeholder-slate-500 focus:border-orange-500/50 h-12"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-slate-300">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-black/20 border-white/10 text-white placeholder-slate-500 focus:border-orange-500/50 h-12"
                />
                {tab === "register" && (
                  <p className="mt-1 text-xs text-slate-400">At least 8 characters</p>
                )}
              </div>
              {error && (
                <p className="text-sm font-medium text-red-400 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-center">{error}</p>
              )}
              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-orange-500 to-pink-600 hover:from-orange-400 hover:to-pink-500 text-white h-12 rounded-xl text-base font-semibold shadow-[0_0_20px_rgba(245,130,32,0.3)] hover:shadow-[0_0_30px_rgba(245,130,32,0.5)] border-0 transition-all mt-2"
                disabled={loading}
              >
                {loading
                  ? "Please wait..."
                  : tab === "signin"
                    ? "Sign In"
                    : "Create Account"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

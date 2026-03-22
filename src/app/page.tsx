"use client";

import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import {
  TrendingUp,
  FileText,
  ArrowRight,
  User,
  Zap,
  Star
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function LandingPage() {
  const { data: session } = useSession();

  if (session) {
    redirect("/portal");
  }

  return (
    <div className="min-h-screen bg-[#0a0514] text-slate-100 font-sans selection:bg-orange-500/30 relative">
      {/* Global Background Texture */}
      <div className="fixed inset-0 pointer-events-none z-0">
        {/* Subtle dot grid */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:32px_32px]" />
        {/* Grain/Noise overlay for a premium matte feel */}
        <div className="absolute inset-0 opacity-[0.03] mix-blend-overlay" style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.8%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E')" }}></div>
      </div>

      <div className="relative z-10">
        {/* Navbar */}
      <nav className="fixed w-full z-50 top-0 border-b border-white/5 bg-[#0a0514]/80 backdrop-blur-md">
        <div className="container mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image 
              src="/logo-icon.png" 
              alt="Resumsify Logo" 
              width={40} 
              height={40} 
              className="rounded-xl shadow-lg shadow-orange-500/20" 
            />
            <span className="text-xl font-bold tracking-tight text-white">
              Resumsify
            </span>
          </div>
          <div className="flex items-center gap-6">
            <Link
              href="/login"
              className="text-sm font-medium text-slate-300 hover:text-white transition-colors hidden sm:block"
            >
              Sign In
            </Link>
            <Button
              asChild
              className="bg-white text-black hover:bg-slate-200 rounded-full px-6 transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)] border-0"
            >
              <Link href="/login">Get Started</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-40 pb-32 overflow-hidden flex flex-col items-center min-h-[90vh] justify-center">
        {/* Custom floating animation styles */}
        <style dangerouslySetContent={{ __html: `
          @keyframes float-slow {
            0%, 100% { transform: translate(0, 0) rotate(0deg); }
            33% { transform: translate(15px, -25px) rotate(2deg); }
            66% { transform: translate(-15px, 20px) rotate(-2deg); }
          }
          @keyframes float-fast {
            0%, 100% { transform: translate(0, 0) rotate(0deg); }
            33% { transform: translate(-20px, 20px) rotate(-4deg); }
            66% { transform: translate(20px, -15px) rotate(4deg); }
          }
          @keyframes float-medium {
            0%, 100% { transform: translate(0, 0) rotate(0deg); }
            50% { transform: translate(10px, -30px) rotate(3deg); }
          }
          .animate-float-slow { animation: float-slow 12s ease-in-out infinite; }
          .animate-float-fast { animation: float-fast 8s ease-in-out infinite; }
          .animate-float-medium { animation: float-medium 10s ease-in-out infinite; }
        ` }} />

        {/* Background Gradients */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-orange-500/20 rounded-full blur-[120px] opacity-50 pointer-events-none" />
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-purple-600/20 rounded-full blur-[120px] opacity-40 pointer-events-none" />
        
        {/* Animated Workers Orbitting the Text */}
        <div className="absolute inset-0 max-w-7xl mx-auto pointer-events-none h-full w-full">
          {/* Top Left: Tech Worker */}
          <div className="absolute top-[10%] left-[5%] sm:left-[15%] w-24 sm:w-40 aspect-square rounded-full border-[3px] border-white/10 overflow-hidden shadow-[0_0_40px_rgba(245,130,32,0.3)] animate-float-slow opacity-80 backdrop-blur-sm z-0">
            <img src="https://images.unsplash.com/photo-1531427186611-ecfd6d936c79?auto=format&fit=crop&q=80&w=400" alt="Tech Worker" className="w-full h-full object-cover" />
          </div>

          {/* Top Right: Healthcare Worker */}
          <div className="absolute top-[15%] right-[5%] sm:right-[15%] w-20 sm:w-32 aspect-square rounded-3xl border border-white/20 overflow-hidden shadow-2xl animate-float-fast opacity-90 backdrop-blur-sm z-0 transform rotate-12">
            <img src="https://images.unsplash.com/photo-1594824476967-48c8b964273f?auto=format&fit=crop&q=80&w=400" alt="Medical Worker" className="w-full h-full object-cover" />
          </div>

          {/* Bottom Left: Architecture / Trade */}
          <div className="absolute bottom-[25%] left-[2%] sm:left-[10%] w-28 sm:w-48 aspect-[4/3] rounded-2xl border-[4px] border-[#0a0514] overflow-hidden shadow-[0_20px_40px_rgba(0,0,0,0.8)] animate-float-medium opacity-90 z-20 transform -rotate-6">
            <img src="https://images.unsplash.com/photo-1504307651254-35680f356f58?auto=format&fit=crop&q=80&w=400" alt="Trade Worker" className="w-full h-full object-cover" />
          </div>

          {/* Bottom Right: Corporate/Creative */}
          <div className="absolute bottom-[20%] right-[2%] sm:right-[12%] w-32 sm:w-44 aspect-square rounded-[2rem] border-2 border-pink-500/30 overflow-hidden shadow-[0_0_50px_rgba(236,72,153,0.3)] animate-float-slow opacity-85 z-20">
            <img src="https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&q=80&w=400" alt="Creative Professional" className="w-full h-full object-cover" />
          </div>
        </div>

        <div className="container mx-auto px-6 relative z-10 text-center mt-12 md:mt-0 flex flex-col items-center">
          <Badge className="mb-8 bg-white/5 text-orange-400 hover:bg-white/10 border-orange-500/20 px-4 py-1.5 rounded-full text-sm font-medium backdrop-blur-xl shadow-lg">
            <Star className="w-4 h-4 mr-2 inline" />
            Your Career, Your Rules
          </Badge>
          
          <h1 className="text-5xl md:text-7xl lg:text-[6.5rem] font-black mb-8 leading-[1.1] tracking-tight relative drop-shadow-2xl">
            Own your
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-pink-500 to-purple-600">
              Professional Value
            </span>
          </h1>
          
          <p className="text-lg md:text-2xl text-slate-300/90 mb-12 max-w-2xl mx-auto leading-relaxed backdrop-blur-sm bg-[#0a0514]/30 rounded-2xl p-4 border border-white/5">
            Stop tailoring yourself to fit corporate boxes. Build a breathtaking career portfolio, interactive resume, and track your true worth.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 relative z-30">
            <Button
              asChild
              size="lg"
              className="h-14 px-8 text-base bg-gradient-to-r from-orange-500 to-pink-600 hover:from-orange-400 hover:to-pink-500 text-white rounded-full transition-all shadow-[0_0_40px_rgba(245,130,32,0.3)] hover:shadow-[0_0_60px_rgba(245,130,32,0.5)] border-0"
            >
              <Link href="/login">
                Build Your Portfolio
                <ArrowRight className="ml-2 w-5 h-5" />
              </Link>
            </Button>
          </div>
          
          {/* Hero Visual: White card morphed around diverse workers */}
          <div className="mt-32 sm:mt-40 relative mx-auto max-w-6xl h-[450px] sm:h-[600px] flex items-center justify-center w-full">
            
            {/* The main white card background */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[95%] sm:w-[85%] h-[350px] sm:h-[480px] bg-slate-50 rounded-[2.5rem] shadow-[0_0_100px_rgba(255,255,255,0.05)] p-6 sm:p-14 flex flex-col justify-center items-center text-center overflow-visible transition-all z-10">
              <div className="max-w-sm sm:max-w-xl z-20 relative mx-auto flex flex-col items-center pt-8 sm:pt-0">
                <div className="flex flex-wrap justify-center gap-2 mb-4 sm:mb-6">
                  <Badge className="bg-white border-slate-200 text-slate-800 shadow-sm hover:bg-slate-100 px-3 py-1 text-xs sm:text-sm font-medium">Tech</Badge>
                  <Badge className="bg-white border-slate-200 text-slate-800 shadow-sm hover:bg-slate-100 px-3 py-1 text-xs sm:text-sm font-medium">Healthcare</Badge>
                  <Badge className="bg-white border-slate-200 text-slate-800 shadow-sm hover:bg-slate-100 px-3 py-1 text-xs sm:text-sm font-medium">Trades</Badge>
                  <Badge className="bg-gradient-to-r from-orange-500 to-pink-500 text-white shadow-sm border-0 px-3 py-1 text-xs sm:text-sm font-medium">All Professionals</Badge>
                </div>
                <h3 className="text-3xl sm:text-5xl font-black text-slate-900 mb-4 sm:mb-6 tracking-tight leading-[1.1]">
                  Your multidimensional career, visualized.
                </h3>
                <p className="text-slate-500 text-sm sm:text-lg font-medium leading-relaxed hidden sm:block">
                  Whether you're treating patients, writing code, or building infrastructure. The tools to track your growth finally belong to you.
                </p>
              </div>

              {/* Decorative timeline line inside the card */}
              <div className="hidden sm:block absolute right-32 top-1/2 -translate-y-1/2 w-[2px] h-[60%] bg-slate-200 -z-10">
                 <div className="absolute top-[10%] -left-[5px] w-3 h-3 rounded-full bg-orange-400 shadow-[0_0_15px_rgba(245,130,32,0.8)]" />
                 <div className="absolute top-[50%] -left-[5px] w-3 h-3 rounded-full bg-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.8)]" />
                 <div className="absolute top-[90%] -left-[5px] w-3 h-3 rounded-full bg-pink-500 shadow-[0_0_15px_rgba(236,72,153,0.8)]" />
              </div>
            </div>

            {/* Workers Breaking out of the card */}
            
            {/* Worker 1: Left Foreground */}
            <div className="absolute left-[0%] sm:left-[2%] bottom-[5%] w-36 sm:w-64 h-52 sm:h-[22rem] rounded-3xl overflow-hidden shadow-2xl z-30 border-[6px] border-[#0a0514] transform -rotate-3 hover:rotate-0 hover:-translate-y-4 transition-all duration-500 bg-slate-800">
              <img src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=600" alt="Corporate Professional" className="w-full h-full object-cover opacity-90 hover:opacity-100 transition-opacity" />
            </div>

            {/* Worker 2: Top Right Floating Circular */}
            <div className="absolute right-[2%] sm:right-[12%] top-[-10%] sm:top-[-10%] w-32 sm:w-56 h-32 sm:h-56 rounded-full overflow-hidden shadow-[0_20px_40px_rgba(0,0,0,0.4)] z-30 border-[4px] sm:border-[6px] border-slate-50 transform rotate-6 hover:scale-105 transition-all duration-500 bg-slate-800">
              <img src="https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&q=80&w=600" alt="Healthcare Worker" className="w-full h-full object-cover opacity-90 hover:opacity-100 transition-opacity" />
            </div>

            {/* Worker 3: Bottom Right Depth */}
            <div className="absolute right-[-2%] sm:right-[2%] bottom-[-10%] sm:bottom-[-5%] w-48 sm:w-80 h-40 sm:h-72 rounded-3xl overflow-hidden shadow-xl z-30 border-[6px] border-[#0a0514] transform rotate-3 hover:-translate-y-2 transition-all duration-500 drop-shadow-[0_20px_20px_rgba(0,0,0,0.5)] bg-slate-800">
              <img src="https://images.unsplash.com/photo-1581092921461-eab62e97a780?auto=format&fit=crop&q=80&w=600" alt="Industrial/Tech Worker" className="w-full h-full object-cover opacity-90 hover:opacity-100 transition-opacity" />
              
              {/* Floating Glass UI on Worker 3 */}
              <div className="absolute bottom-3 sm:bottom-6 left-3 sm:left-6 right-3 sm:right-6 bg-white/90 backdrop-blur-md px-3 sm:px-4 py-2 sm:py-3 rounded-xl shadow-xl border border-white/50">
                <p className="text-[9px] sm:text-xs font-bold text-slate-800 uppercase tracking-wider mb-1 sm:mb-2">Skill Value</p>
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="flex-1 h-1.5 sm:h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div className="w-[92%] h-full bg-gradient-to-r from-orange-400 to-pink-500 rounded-full" />
                  </div>
                  <p className="text-[10px] sm:text-xs font-black text-slate-900">Top 8%</p>
                </div>
              </div>
            </div>

            {/* Floating Abstract UI Tag */}
            <div className="absolute left-[10%] sm:left-[25%] -top-6 sm:-top-12 bg-[#120a24] border border-white/10 px-4 sm:px-8 py-2 sm:py-5 rounded-2xl shadow-[0_20px_40px_rgba(0,0,0,0.6)] z-40 transform -rotate-3 hover:rotate-0 transition-transform">
               <div className="flex items-center gap-2 sm:gap-3 mb-0.5 sm:mb-1">
                  <span className="relative flex h-2 w-2 sm:h-3 sm:w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 sm:h-3 sm:w-3 bg-pink-500"></span>
                  </span>
                  <span className="text-slate-300 font-medium text-[10px] sm:text-sm uppercase tracking-wide">Interview Request</span>
               </div>
               <p className="text-base sm:text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-pink-500">$145k - $160k</p>
            </div>
            
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-32 relative border-t border-white/5 bg-[#0e081c]">
        <div className="container mx-auto px-6">
          <div className="text-center mb-32">
            <h2 className="text-3xl md:text-5xl font-bold mb-6">Designed for the <span className="text-orange-400">Worker</span>, not the Corporation</h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">
              Your career is more than a list of jobs. It is a journey of skill acquisition, value creation, and personal growth.
            </p>
          </div>

          <div className="space-y-32 sm:space-y-48 max-w-6xl mx-auto">
            {/* Feature 1: Career Portfolio - Left Visual, Right Backdrop */}
            <div className="relative flex flex-col md:block items-center h-auto md:h-[500px]">
               {/* White Offset Background Card */}
               <div className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 w-[75%] h-[420px] bg-slate-50 rounded-[3rem] p-16 flex-col justify-center items-start pl-[35%] z-10 shadow-[0_0_100px_rgba(255,255,255,0.02)]">
                  <div className="w-16 h-16 rounded-2xl bg-orange-500/10 flex items-center justify-center mb-6 text-orange-500">
                     <User className="w-8 h-8" />
                  </div>
                  <h3 className="text-4xl font-black text-slate-900 mb-4 tracking-tight">Career Portfolio</h3>
                  <p className="text-slate-500 text-lg leading-relaxed">
                    Showcase your real impact. Compile projects, testimonials, and tangible results in a breathtaking digital portfolio that speaks louder than bullet points.
                  </p>
               </div>
               
               {/* Foreground Object */}
               <div className="relative md:absolute md:left-0 md:top-1/2 md:-translate-y-1/2 w-full md:w-[45%] h-[300px] md:h-[500px] z-20 mb-8 md:mb-0">
                  <div className="w-full h-full rounded-[2rem] overflow-hidden shadow-2xl border-[6px] border-[#0a0514] transform md:-rotate-2 md:hover:rotate-0 transition-transform duration-500 bg-slate-800">
                     <img src="https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=800" alt="Portfolio" className="w-full h-full object-cover opacity-90 hover:opacity-100" />
                  </div>
                  
                  {/* Floating Notification */}
                  <div className="absolute -bottom-6 right-6 md:-right-12 bg-white/90 backdrop-blur top-auto px-6 py-4 rounded-2xl shadow-xl z-30 transform md:rotate-3 border border-slate-200 flex items-center gap-4">
                     <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center">
                        <Star className="w-6 h-6 text-orange-500" />
                     </div>
                     <div>
                       <p className="text-sm font-bold text-slate-900">New Endorsement</p>
                       <p className="text-xs text-slate-500">From Sarah (Engineering Lead)</p>
                     </div>
                  </div>
               </div>

               {/* Mobile Text Content */}
               <div className="md:hidden flex flex-col items-center text-center px-4">
                 <div className="w-16 h-16 rounded-2xl bg-orange-500/10 flex items-center justify-center mb-6 text-orange-400">
                   <User className="w-8 h-8" />
                 </div>
                 <h3 className="text-2xl font-bold mb-4 text-white">Career Portfolio</h3>
                 <p className="text-slate-400 leading-relaxed">
                   Showcase your real impact. Compile projects, testimonials, and tangible results in a breathtaking digital portfolio that speaks louder than bullet points.
                 </p>
               </div>
            </div>

            {/* Feature 2: Interactive Resume - Right Visual, Left Backdrop */}
            <div className="relative flex flex-col md:block items-center h-auto md:h-[500px]">
               {/* Dark/Gradient Offset Background Card */}
               <div className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 w-[75%] h-[420px] bg-gradient-to-br from-[#1a0f2e] to-[#0a0514] border border-white/5 rounded-[3rem] p-16 flex-col justify-center items-start pr-[35%] z-10 shadow-[0_40px_100px_rgba(236,72,153,0.05)]">
                  <div className="w-16 h-16 rounded-2xl bg-pink-500/10 flex items-center justify-center mb-6 text-pink-400">
                     <FileText className="w-8 h-8" />
                  </div>
                  <h3 className="text-4xl font-black text-white mb-4 tracking-tight">Interactive Resume</h3>
                  <p className="text-slate-400 text-lg leading-relaxed">
                    Ditch the static PDF. Generate dynamic, interactive viewing experiences tailored for each opportunity. Check out live insights and real-time updates.
                  </p>
               </div>
               
               {/* Foreground Object */}
               <div className="relative md:absolute md:right-0 md:top-1/2 md:-translate-y-1/2 w-full md:w-[45%] h-[300px] md:h-[500px] z-20 mb-8 md:mb-0">
                  <div className="w-full h-full rounded-[2rem] overflow-hidden shadow-2xl border-[6px] border-[#0a0514] transform md:rotate-2 md:hover:rotate-0 transition-transform duration-500 bg-slate-800">
                     <img src="https://images.unsplash.com/photo-1586281380349-632531db7ed4?auto=format&fit=crop&q=80&w=800" alt="Resume Elements" className="w-full h-full object-cover opacity-90 hover:opacity-100" />
                  </div>
                  
                  {/* Floating Analytics Tag */}
                  <div className="absolute top-6 -left-6 md:-left-12 bg-black/60 backdrop-blur-xl border border-white/10 px-5 py-3 rounded-xl shadow-2xl z-30 flex items-center gap-3">
                     <div className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                     </div>
                     <span className="text-white text-sm font-semibold tracking-wide">Recruiter Viewing Now</span>
                  </div>
               </div>

               {/* Mobile Text Content */}
               <div className="md:hidden flex flex-col items-center text-center px-4">
                 <div className="w-16 h-16 rounded-2xl bg-pink-500/10 flex items-center justify-center mb-6 text-pink-400">
                   <FileText className="w-8 h-8" />
                 </div>
                 <h3 className="text-2xl font-bold mb-4 text-white">Interactive Resume</h3>
                 <p className="text-slate-400 leading-relaxed">
                   Ditch the static PDF. Generate dynamic, interactive viewing experiences tailored for each opportunity. Check out live insights and real-time updates.
                 </p>
               </div>
            </div>

            {/* Feature 3: Analytics - Left Visual, Right Backdrop */}
            <div className="relative flex flex-col md:block items-center h-auto md:h-[500px]">
               {/* White Offset Background Card */}
               <div className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 w-[75%] h-[420px] bg-slate-50 rounded-[3rem] p-16 flex-col justify-center items-start pl-[35%] z-10 shadow-[0_0_100px_rgba(255,255,255,0.02)]">
                  <div className="w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-6 text-purple-600">
                     <TrendingUp className="w-8 h-8" />
                  </div>
                  <h3 className="text-4xl font-black text-slate-900 mb-4 tracking-tight">Career Analytics</h3>
                  <p className="text-slate-500 text-lg leading-relaxed">
                    Treat your career like a business. Track your salary trajectory, compensation benchmarks, interview conversion rates, and skill market value in real-time.
                  </p>
               </div>
               
               {/* Foreground Object */}
               <div className="relative md:absolute md:left-0 md:top-1/2 md:-translate-y-1/2 w-full md:w-[45%] h-[300px] md:h-[500px] z-20 mb-8 md:mb-0">
                  <div className="w-full h-full rounded-[2rem] overflow-hidden shadow-2xl border-[6px] border-[#0a0514] transform md:-rotate-2 md:hover:rotate-0 transition-transform duration-500 bg-slate-800">
                     <img src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=800" alt="Analytics Graph" className="w-full h-full object-cover opacity-90 hover:opacity-100" />
                  </div>
                  
                  {/* Floating Chart Tag */}
                  <div className="absolute bottom-12 -right-6 md:-right-12 bg-[#120a24] border border-purple-500/20 px-6 py-4 rounded-2xl shadow-xl z-30 transform md:rotate-3">
                     <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Market Value</p>
                     <p className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500">+24%</p>
                     <p className="text-xs text-slate-500 mt-1">vs Industry Avg</p>
                  </div>
               </div>

               {/* Mobile Text Content */}
               <div className="md:hidden flex flex-col items-center text-center px-4">
                 <div className="w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-6 text-purple-400">
                   <TrendingUp className="w-8 h-8" />
                 </div>
                 <h3 className="text-2xl font-bold mb-4 text-white">Career Analytics</h3>
                 <p className="text-slate-400 leading-relaxed">
                   Treat your career like a business. Track your salary trajectory, compensation benchmarks, interview conversion rates, and skill market value in real-time.
                 </p>
               </div>
            </div>
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section className="py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-orange-900/20" />
        <div className="container mx-auto px-6 relative z-10 text-center">
          <h2 className="text-4xl md:text-6xl font-bold mb-8">Ready to take control?</h2>
          <p className="text-xl text-slate-400 mb-12 max-w-2xl mx-auto">
            Join the individuals who are building their personal branding infrastructure and stepping out of the corporate shadow.
          </p>
          <Button
            asChild
            size="lg"
            className="h-16 px-10 text-lg bg-white text-black hover:bg-slate-200 rounded-full transition-all shadow-xl border-0"
          >
            <Link href="/login">
              Start Your Journey
              <Zap className="ml-2 w-5 h-5 text-orange-500" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-white/5 bg-[#0a0514] text-center text-slate-500 text-sm">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Image 
            src="/logo-icon.png" 
            alt="Resumsify Logo" 
            width={24} 
            height={24} 
            className="rounded-md"
          />
          <span className="font-semibold text-slate-300">Resumsify</span>
        </div>
        <p>© {new Date().getFullYear()} Resumsify. Built for the individual.</p>
      </footer>
      </div>
    </div>
  );
}

import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Shield, Lock, FileText, Mail } from "lucide-react";
import roomriseLogo from "@/assets/roomrise-logo.png";

/* ═══════════════════════════════════════════════════════════════
   PUBLIC HOME PAGE — /about
   Google OAuth Branding: Application home page
   ═══════════════════════════════════════════════════════════════ */

export default function PublicHomePage() {
    useEffect(() => {
        document.title = "Roomrise Control Hub — Internal Operations Platform";
    }, []);

    return (
        <PublicLayout>
            {/* Hero — big branded logo + app name + purpose */}
            <section className="py-14 sm:py-20">
                <div className="mx-auto max-w-2xl px-4 text-center">
                    <img
                        src={roomriseLogo}
                        alt="Roomrise Solutions logo"
                        className="mx-auto h-24 sm:h-28 w-auto object-contain"
                    />

                    <h1 className="mt-6 text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
                        Roomrise Control Hub
                    </h1>
                    <p className="mt-2 text-base text-slate-500">
                        Official public information page for Roomrise Control Hub.
                    </p>

                    <p className="mt-5 text-lg text-slate-600 leading-relaxed">
                        Roomrise Control Hub is an internal operations platform used by the
                        Roomrise team to manage operational workflows, including bookings,
                        communications, notifications, finance, and related business
                        processes.
                    </p>

                    <div className="mt-6 inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
                        <Lock className="h-4 w-4 shrink-0" />
                        <span>
                            Access to this application is restricted to authorized users only.
                        </span>
                    </div>

                    {/* Plain-text policy links — required visible by Google */}
                    <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6 text-sm">
                        <Link
                            to="/privacy-policy"
                            className="text-blue-600 hover:text-blue-800 underline underline-offset-2 font-medium"
                        >
                            Privacy Policy
                        </Link>
                        <span className="hidden sm:inline text-slate-300">|</span>
                        <Link
                            to="/terms"
                            className="text-blue-600 hover:text-blue-800 underline underline-offset-2 font-medium"
                        >
                            Terms of Service
                        </Link>
                    </div>
                </div>
            </section>

            {/* Visible policy links — required by Google */}
            <section className="mx-auto max-w-3xl px-4 pb-16">
                <h2 className="text-center text-lg font-semibold text-slate-800 mb-6">
                    Policies &amp; Legal
                </h2>
                <div className="grid gap-6 sm:grid-cols-2">
                    <PolicyCard
                        icon={<Shield className="h-5 w-5 text-blue-600" />}
                        title="Privacy Policy"
                        description="How Roomrise Control Hub collects, uses, and protects data."
                        to="/privacy-policy"
                    />
                    <PolicyCard
                        icon={<FileText className="h-5 w-5 text-blue-600" />}
                        title="Terms of Service"
                        description="Terms governing the use of Roomrise Control Hub."
                        to="/terms"
                    />
                </div>
            </section>

            {/* Contact */}
            <section className="mx-auto max-w-3xl px-4 pb-20">
                <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
                    <Mail className="mx-auto h-5 w-5 text-slate-400 mb-2" />
                    <p className="text-sm text-slate-600">
                        For support or inquiries, contact us at{" "}
                        <a
                            href="mailto:admin@roomrise.vn"
                            className="font-medium text-blue-600 hover:underline"
                        >
                            admin@roomrise.vn
                        </a>
                    </p>
                </div>
            </section>
        </PublicLayout>
    );
}

/* ── Policy link card ── */
function PolicyCard({
    icon,
    title,
    description,
    to,
}: {
    icon: React.ReactNode;
    title: string;
    description: string;
    to: string;
}) {
    return (
        <Link
            to={to}
            className="group flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-blue-200 hover:shadow-md"
        >
            <div className="flex items-center gap-2">
                {icon}
                <h3 className="font-semibold text-slate-900 group-hover:text-blue-700 transition-colors">
                    {title}
                </h3>
            </div>
            <p className="text-sm text-slate-500">{description}</p>
        </Link>
    );
}

/* ═══════════════════════════════════════════════════════════════
   SHARED PUBLIC LAYOUT — header + footer for all public pages
   ═══════════════════════════════════════════════════════════════ */

export function PublicLayout({ children }: { children: React.ReactNode }) {
    const location = useLocation();
    const isActive = (path: string) => location.pathname === path;

    return (
        <div className="min-h-screen flex flex-col bg-slate-50">
            {/* Header */}
            <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
                <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
                    <Link to="/about" className="flex items-center gap-2.5">
                        <img
                            src={roomriseLogo}
                            alt="Roomrise Solutions"
                            className="h-9 w-auto object-contain"
                        />
                        <span className="text-base font-bold text-slate-900">
                            Roomrise Control Hub
                        </span>
                    </Link>

                    {/* Navigation — visible on ALL screen sizes */}
                    <nav className="flex items-center gap-4 sm:gap-6 text-sm">
                        <Link
                            to="/about"
                            className={`transition-colors ${isActive("/about") ? "text-blue-700 font-medium" : "text-slate-600 hover:text-slate-900"}`}
                        >
                            Home
                        </Link>
                        <Link
                            to="/privacy-policy"
                            className={`transition-colors ${isActive("/privacy-policy") ? "text-blue-700 font-medium" : "text-slate-600 hover:text-slate-900"}`}
                        >
                            Privacy Policy
                        </Link>
                        <Link
                            to="/terms"
                            className={`transition-colors ${isActive("/terms") ? "text-blue-700 font-medium" : "text-slate-600 hover:text-slate-900"}`}
                        >
                            Terms of Service
                        </Link>
                    </nav>
                </div>
            </header>

            {/* Content */}
            <main className="flex-1">{children}</main>

            {/* Footer */}
            <footer className="border-t border-slate-200 bg-white">
                <div className="mx-auto max-w-5xl px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500">
                    <p>&copy; {new Date().getFullYear()} Roomrise. All rights reserved.</p>
                    <div className="flex items-center gap-4">
                        <Link
                            to="/privacy-policy"
                            className="hover:text-slate-700 transition-colors"
                        >
                            Privacy Policy
                        </Link>
                        <Link
                            to="/terms"
                            className="hover:text-slate-700 transition-colors"
                        >
                            Terms of Service
                        </Link>
                        <a
                            href="mailto:admin@roomrise.vn"
                            className="hover:text-slate-700 transition-colors"
                        >
                            Contact
                        </a>
                    </div>
                </div>
            </footer>
        </div>
    );
}

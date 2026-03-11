import { useEffect } from "react";
import { PublicLayout } from "./PublicHomePage";

export default function TermsPage() {
    useEffect(() => {
        document.title = "Terms of Service — Roomrise Control Hub";
    }, []);

    return (
        <PublicLayout>
            <article className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
                {/* Distinct header block with slate accent */}
                <div className="border-l-4 border-slate-700 pl-5">
                    <h1 className="text-3xl font-bold text-slate-900">
                        Terms of Service
                    </h1>
                    <p className="mt-1 text-base text-slate-600">
                        Roomrise Control Hub
                    </p>
                    <p className="mt-1 text-sm text-slate-400">
                        Last updated: March 10, 2026
                    </p>
                </div>

                <div className="mt-10 space-y-8 text-slate-700 leading-relaxed">
                    <Section title="1. Service Description">
                        <p>
                            Roomrise Control Hub (&ldquo;the Platform&rdquo;) is an internal
                            operations platform provided by Roomrise for use by authorized
                            Roomrise team members. The Platform facilitates management of
                            bookings, communications, financial operations, channel
                            integrations, and related business workflows.
                        </p>
                    </Section>

                    <Section title="2. Access and Authorization">
                        <p>
                            Access to Roomrise Control Hub is restricted to authorized
                            personnel only. Access credentials are provisioned by Roomrise
                            administration. Unauthorized access or use of the Platform is
                            strictly prohibited.
                        </p>
                    </Section>

                    <Section title="3. Acceptable Use">
                        <p>Users of the Platform agree to:</p>
                        <ul className="mt-2 list-disc pl-6 space-y-1 text-sm">
                            <li>
                                Use the Platform only for authorized operational purposes
                            </li>
                            <li>
                                Maintain the confidentiality of their access credentials
                            </li>
                            <li>
                                Not share access credentials with unauthorized individuals
                            </li>
                            <li>
                                Not attempt to access areas or data beyond their authorized
                                scope
                            </li>
                            <li>
                                Not use the Platform for any purpose that violates applicable
                                laws or regulations
                            </li>
                            <li>
                                Report any security concerns or suspected unauthorized access
                                promptly
                            </li>
                        </ul>
                    </Section>

                    <Section title="4. Account Responsibility">
                        <p>
                            Each authorized user is responsible for all activity that occurs
                            under their account. Users should use strong passwords, enable any
                            available security features, and notify administration immediately
                            if they suspect their account has been compromised.
                        </p>
                    </Section>

                    <Section title="5. Service Availability">
                        <p>
                            We strive to maintain high availability of the Platform, but we do
                            not guarantee uninterrupted access. The Platform may be
                            temporarily unavailable due to maintenance, updates, or
                            circumstances beyond our reasonable control. We will make
                            reasonable efforts to notify users of planned downtime.
                        </p>
                    </Section>

                    <Section title="6. Third-Party Integrations">
                        <p>
                            The Platform may integrate with third-party services (such as
                            email providers, OTA channels, and payment systems). Use of these
                            integrations is subject to the respective third-party terms and
                            policies. Roomrise is not responsible for the availability or
                            functionality of third-party services.
                        </p>
                    </Section>

                    <Section title="7. Intellectual Property">
                        <p>
                            All content, features, and functionality of Roomrise Control Hub,
                            including but not limited to software, design, text, and graphics,
                            are owned by Roomrise and are protected by applicable intellectual
                            property laws. Users are granted a limited, non-transferable right
                            to use the Platform for its intended operational purposes.
                        </p>
                    </Section>

                    <Section title="8. Termination and Suspension">
                        <p>
                            Roomrise reserves the right to suspend or terminate access to the
                            Platform for any user at any time, with or without notice,
                            particularly in cases of:
                        </p>
                        <ul className="mt-2 list-disc pl-6 space-y-1 text-sm">
                            <li>Violation of these Terms of Service</li>
                            <li>Unauthorized or abusive use of the Platform</li>
                            <li>
                                Change in the user&rsquo;s authorized status within the
                                organization
                            </li>
                            <li>Security concerns</li>
                        </ul>
                    </Section>

                    <Section title="9. Limitation of Liability">
                        <p>
                            To the maximum extent permitted by applicable law, Roomrise shall
                            not be liable for any indirect, incidental, special, or
                            consequential damages arising from the use of or inability to use
                            the Platform. The Platform is provided on an &ldquo;as is&rdquo;
                            and &ldquo;as available&rdquo; basis.
                        </p>
                    </Section>

                    <Section title="10. Changes to These Terms">
                        <p>
                            We may update these Terms of Service from time to time. Users will
                            be notified of significant changes. Continued use of the Platform
                            after changes take effect constitutes acceptance of the updated
                            terms.
                        </p>
                    </Section>

                    <Section title="11. Contact">
                        <p>
                            For questions about these terms, please contact us at{" "}
                            <a
                                href="mailto:admin@roomrise.vn"
                                className="font-medium text-blue-600 hover:underline"
                            >
                                admin@roomrise.vn
                            </a>
                            .
                        </p>
                    </Section>
                </div>
            </article>
        </PublicLayout>
    );
}

function Section({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <section>
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            <div className="mt-2 text-sm">{children}</div>
        </section>
    );
}

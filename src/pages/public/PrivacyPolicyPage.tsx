import { useEffect } from "react";
import { PublicLayout } from "./PublicHomePage";

export default function PrivacyPolicyPage() {
    useEffect(() => {
        document.title = "Privacy Policy — Roomrise Control Hub";
    }, []);

    return (
        <PublicLayout>
            <article className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
                {/* Distinct header block with blue accent */}
                <div className="border-l-4 border-blue-600 pl-5">
                    <h1 className="text-3xl font-bold text-slate-900">Privacy Policy</h1>
                    <p className="mt-1 text-base text-slate-600">
                        Roomrise Control Hub
                    </p>
                    <p className="mt-1 text-sm text-slate-400">
                        Last updated: March 10, 2026
                    </p>
                </div>

                <div className="mt-10 space-y-8 text-slate-700 leading-relaxed">
                    <Section title="1. Who We Are">
                        <p>
                            Roomrise Control Hub (&ldquo;the Platform&rdquo;) is operated by
                            Roomrise. This Privacy Policy explains how we collect, use, and
                            protect information within Roomrise Control Hub, an internal
                            operations platform used by authorized Roomrise team members.
                        </p>
                    </Section>

                    <Section title="2. What the Platform Is Used For">
                        <p>
                            Roomrise Control Hub is used internally by the Roomrise team to
                            manage operational workflows, including but not limited to:
                        </p>
                        <ul className="mt-2 list-disc pl-6 space-y-1 text-sm">
                            <li>Booking and reservation management</li>
                            <li>Guest communications and messaging</li>
                            <li>Email processing and management</li>
                            <li>Financial operations and settlements</li>
                            <li>Channel and inventory management</li>
                            <li>Notifications and workflow automation</li>
                        </ul>
                    </Section>

                    <Section title="3. Information We Collect and Process">
                        <p>
                            In the course of providing the Platform, we may collect and
                            process the following categories of information:
                        </p>
                        <ul className="mt-2 list-disc pl-6 space-y-2 text-sm">
                            <li>
                                <strong>Account Information:</strong> Name, email address, and
                                role of authorized team members who access the Platform.
                            </li>
                            <li>
                                <strong>Authentication Data:</strong> Login credentials, session
                                tokens, and authentication state necessary for secure access to
                                the Platform.
                            </li>
                            <li>
                                <strong>Operational Data:</strong> Booking records, guest
                                information, financial records, and other business data
                                processed through the Platform as part of daily operations.
                            </li>
                            <li>
                                <strong>Connected Service Data:</strong> When third-party
                                services are connected to the Platform (such as Gmail for email
                                management or OTA channel integrations), the Platform may access
                                and process data from those services as authorized by the
                                connecting user. This includes email content, booking data from
                                OTAs, and related metadata.
                            </li>
                            <li>
                                <strong>Usage Data:</strong> Platform usage patterns, feature
                                interactions, and system logs used for maintaining reliability
                                and performance.
                            </li>
                        </ul>
                    </Section>

                    <Section title="4. How We Use Information">
                        <p>Information processed through the Platform is used to:</p>
                        <ul className="mt-2 list-disc pl-6 space-y-1 text-sm">
                            <li>Provide and maintain internal operational workflows</li>
                            <li>Authenticate and manage user access</li>
                            <li>
                                Process bookings, communications, and financial operations
                            </li>
                            <li>Send notifications and alerts to authorized team members</li>
                            <li>Ensure system reliability, security, and performance</li>
                            <li>
                                Comply with applicable legal and regulatory requirements
                            </li>
                        </ul>
                    </Section>

                    <Section title="5. Data Sharing">
                        <p>
                            Data processed through Roomrise Control Hub may be shared with:
                        </p>
                        <ul className="mt-2 list-disc pl-6 space-y-2 text-sm">
                            <li>
                                <strong>Internal Authorized Personnel:</strong> Roomrise team
                                members with appropriate access permissions.
                            </li>
                            <li>
                                <strong>Infrastructure and Service Providers:</strong>{" "}
                                Third-party providers that support the Platform&rsquo;s
                                operation, such as cloud hosting, database services, and
                                authentication providers. These providers process data only as
                                necessary to provide their services.
                            </li>
                            <li>
                                <strong>Connected Third-Party Services:</strong> When the
                                Platform integrates with external services (such as OTA channels
                                or email providers), data may be exchanged as required for those
                                integrations to function.
                            </li>
                        </ul>
                        <p className="mt-3">
                            We do not sell personal information to third parties.
                        </p>
                    </Section>

                    <Section title="6. Data Security">
                        <p>
                            We implement appropriate technical and organizational measures to
                            protect data processed through the Platform. This includes
                            encryption of sensitive data (such as authentication tokens),
                            access controls, secure communication protocols, and regular
                            security practices.
                        </p>
                    </Section>

                    <Section title="7. Data Retention">
                        <p>
                            Data is retained for as long as necessary to fulfill the
                            operational purposes described in this policy, or as required by
                            applicable law. When data is no longer needed, it is securely
                            deleted or anonymized in accordance with our data management
                            practices.
                        </p>
                    </Section>

                    <Section title="8. Your Rights and Inquiries">
                        <p>
                            If you have questions about how your data is handled within
                            Roomrise Control Hub, or if you wish to exercise any data
                            protection rights applicable to you, please contact us at the
                            email address below.
                        </p>
                    </Section>

                    <Section title="9. Changes to This Policy">
                        <p>
                            We may update this Privacy Policy from time to time. Any changes
                            will be reflected on this page with an updated revision date.
                        </p>
                    </Section>

                    <Section title="10. Contact">
                        <p>
                            For privacy-related inquiries, please contact us at{" "}
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

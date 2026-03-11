import { cn } from "@/lib/utils";

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * PageContainer – wraps all page content below the Header.
 * Provides consistent vertical spacing (gap-6 = 24px) between SectionCards.
 * 
 * Usage:
 * ```tsx
 * <MainLayout>
 *   <Header title="Dashboard" icon={BarChart3} />
 *   <PageContainer>
 *     <SectionCard>…content…</SectionCard>
 *     <SectionCard>…content…</SectionCard>
 *   </PageContainer>
 * </MainLayout>
 * ```
 */
export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <div className={cn("flex flex-col gap-5 pt-2 pb-6", className)}>
      {children}
    </div>);

}
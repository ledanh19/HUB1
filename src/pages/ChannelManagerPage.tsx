import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link2, LayoutGrid } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";

const ChannelManagerPage = () => {
  const modules = [
    {
      title: "Channex Integration",
      description: "Quản lý đồng bộ dữ liệu từ Channex - Bookings, Properties, Room Types, Rate Plans",
      icon: Link2,
      href: "/channel-manager/channex",
      color: "text-info",
    },
    {
      title: "Inventory",
      description: "Quản lý tồn kho, giá phòng, restrictions và availability rules",
      icon: LayoutGrid,
      href: "/channel-manager/inventory",
      color: "text-success",
    },
  ];

  return (
    <>
      <Header title="Channel Manager" subtitle="Quản lý kênh phân phối" />
      <PageContainer>
        <SectionCard>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {modules.map((module) => (
          <Link key={module.href} to={module.href}>
            <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer hover:border-primary/50">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg bg-muted ${module.color}`}>
                    <module.icon className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-lg">{module.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm">
                  {module.description}
                </CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
        </SectionCard>
      </PageContainer>
    </>
  );
};

export default ChannelManagerPage;

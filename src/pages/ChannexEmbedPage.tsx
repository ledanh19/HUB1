import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { Loader2, RefreshCw, Building2, ExternalLink, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Property {
  id: string;
  channex_property_id: string;
  property_name: string;
}

export default function ChannexEmbedPage() {
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [iframeKey, setIframeKey] = useState(0);

  // Fetch ALL properties from channex_user_properties
  const { data: properties, isLoading: isLoadingProperties } = useQuery({
    queryKey: ["channex-embed-all-properties"],
    queryFn: async () => {
      const { data: propertiesData, error } = await supabase
        .from("channex_user_properties")
        .select("id, channex_property_id, property_name")
        .order("property_name");

      if (error) throw error;
      return (propertiesData || []) as Property[];
    },
  });

  // Auto-select first property
  useEffect(() => {
    if (properties && properties.length > 0 && !selectedPropertyId) {
      setSelectedPropertyId(properties[0].channex_property_id);
    }
  }, [properties, selectedPropertyId]);

  // Get selected property info
  const selectedProperty = useMemo(() => {
    return properties?.find((p) => p.channex_property_id === selectedPropertyId);
  }, [properties, selectedPropertyId]);

  // Fetch one-time token for selected property
  const {
    data: tokenData,
    isLoading: isLoadingToken,
    error: tokenError,
    refetch: refetchToken,
  } = useQuery({
    queryKey: ["channex-one-time-token", selectedPropertyId],
    queryFn: async () => {
      if (!selectedPropertyId || !selectedProperty) return null;

      const { data, error } = await supabase.functions.invoke("channex-one-time-token", {
        body: {
          property_id: selectedPropertyId,
          property_name: selectedProperty.property_name,
        },
      });

      if (error) throw error;
      return data as { token: string; property_id: string };
    },
    enabled: !!selectedPropertyId && !!selectedProperty,
    staleTime: 4 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  // Build iframe URL
  const iframeUrl = useMemo(() => {
    if (!tokenData?.token || !selectedPropertyId) return null;
    return `https://app.channex.io/auth/exchange?oauth_session_key=${tokenData.token}&app_mode=headless&redirect_to=/inventory&property_id=${selectedPropertyId}`;
  }, [tokenData, selectedPropertyId]);

  const handleRefresh = () => {
    refetchToken();
    setIframeKey((k) => k + 1);
  };

  const handlePropertyChange = (value: string) => {
    setSelectedPropertyId(value);
    setIframeKey((k) => k + 1);
  };

  return (
    <>
      <Header
        title="Channex Inventory"
        subtitle="Quản lý inventory trực tiếp từ Channex"
      />

      <PageContainer className="h-[calc(100vh-14rem)]">
        {/* Toolbar Card */}
        <Card className="border-border/50 shadow-sm">
          <CardContent className="p-3 md:p-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              {/* Property Selector */}
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Building2 className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 sm:flex-none">
                  <Select value={selectedPropertyId} onValueChange={handlePropertyChange}>
                    <SelectTrigger className="w-full sm:w-[280px] md:w-[320px] h-9 bg-background">
                      <SelectValue placeholder="Chọn chỗ nghỉ..." />
                    </SelectTrigger>
                    <SelectContent>
                      {isLoadingProperties ? (
                        <div className="p-2 space-y-2">
                          <Skeleton className="h-8 w-full" />
                          <Skeleton className="h-8 w-full" />
                        </div>
                      ) : (
                        properties?.map((property) => (
                          <SelectItem key={property.channex_property_id} value={property.channex_property_id}>
                            {property.property_name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <Badge variant="outline" className="text-xs font-normal gap-1 hidden md:flex">
                  <Clock className="h-3 w-3" />
                  Session: 5 phút
                </Badge>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleRefresh} 
                  disabled={isLoadingToken}
                  className="h-9"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingToken ? "animate-spin" : ""}`} />
                  Làm mới
                </Button>
                {iframeUrl && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="h-9"
                    onClick={() => window.open(iframeUrl, "_blank")}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Iframe Container */}
        <Card className="flex-1 border-border/50 shadow-sm overflow-hidden">
          <CardContent className="p-0 h-full">
            {isLoadingToken ? (
              <div className="h-full flex items-center justify-center bg-muted/20">
                <div className="flex flex-col items-center gap-4 text-muted-foreground">
                  <div className="relative">
                    <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="font-medium text-foreground">Đang xác thực...</p>
                    <p className="text-sm text-muted-foreground mt-1">Kết nối với Channex</p>
                  </div>
                </div>
              </div>
            ) : tokenError ? (
              <div className="h-full flex items-center justify-center bg-destructive/5">
                <div className="flex flex-col items-center gap-4 text-center p-4 max-w-md">
                  <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
                    <ExternalLink className="h-8 w-8 text-destructive" />
                  </div>
                  <div>
                    <p className="font-semibold text-destructive text-lg">Không thể kết nối</p>
                    <p className="text-sm text-muted-foreground mt-2">
                      {tokenError instanceof Error ? tokenError.message : "Đã xảy ra lỗi khi lấy token xác thực."}
                    </p>
                  </div>
                  <Button onClick={handleRefresh} className="mt-2">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Thử lại
                  </Button>
                </div>
              </div>
            ) : iframeUrl ? (
              <iframe
                key={iframeKey}
                src={iframeUrl}
                className="w-full h-full bg-background"
                title="Channex Inventory"
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
              />
            ) : (
              <div className="h-full flex items-center justify-center bg-muted/20">
                <div className="flex flex-col items-center gap-4 text-center">
                  <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                    <Building2 className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Chọn chỗ nghỉ</p>
                    <p className="text-sm text-muted-foreground mt-1">Chọn một chỗ nghỉ để xem Inventory</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </PageContainer>
    </>
  );
}

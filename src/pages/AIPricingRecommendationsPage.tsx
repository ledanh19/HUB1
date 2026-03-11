import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { useState, useMemo, useEffect } from "react";
import { DecisionOverview } from "@/components/ai-pricing/recommendations/DecisionOverview";
import { RecommendationGroup, RecommendationGroupData } from "@/components/ai-pricing/recommendations/RecommendationGroup";
import { RecommendationDetail, RecommendationDetailData, DataEvidence } from "@/components/ai-pricing/recommendations/RecommendationDetail";
import { NextStepNavigation } from "@/components/ai-pricing/recommendations/NextStepNavigation";
import { WhatRecommendationsDoNot } from "@/components/ai-pricing/recommendations/WhatRecommendationsDoNot";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAIPricingRecommendations } from "@/hooks/useAIPricingRecommendations";
import { AlertCircle, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// Generate detail for a specific group (using real data from hook)
const generateDetailForGroup = (group: RecommendationGroupData): RecommendationDetailData => {
  // Calculate velocity vs baseline from data evidence
  const velocityVsBaseline = group.dataEvidence?.baselineVelocity && group.dataEvidence.baselineVelocity > 0
    ? ((group.dataEvidence.velocity7d - group.dataEvidence.baselineVelocity) / group.dataEvidence.baselineVelocity) * 100
    : 0;

  const baseDetail: RecommendationDetailData = {
    id: group.id,
    dateRange: group.dateRange,
    action: group.action,
    actionStrength: group.actionStrength || 'moderate',
    priority: group.priority,
    confidence: group.confidence,
    validity: group.validity,
    decisionSentence: group.decisionSentence,
    percentRange: group.percentRange,
    keyDrivers: group.keyDrivers,
    observation: {
      demandLevel: group.action === 'increase' ? 'high' : group.action === 'decrease' ? 'low' : 'medium',
      sellingSpeed: velocityVsBaseline > 20 ? 'fast' : velocityVsBaseline < -20 ? 'slow' : 'normal',
      inventoryTrend: (group.dataEvidence?.availableRooms || 0) <= 3 ? 'decreasing' : 'stable',
      description: group.shortReason,
    },
    comparison: {
      velocityVsBaseline: Math.round(velocityVsBaseline),
      leadTimeVsBaseline: group.daysCount,
      description: `Velocity ${velocityVsBaseline >= 0 ? '+' : ''}${velocityVsBaseline.toFixed(0)}% so với cùng kỳ.`,
    },
    implications: group.impactHint || 'Không có rủi ro đáng kể trong ngắn hạn.',
    whyNot: generateWhyNot(group.action),
    scope: group.scope || { roomTypes: ['Tất cả room types'] },
    dataEvidence: group.dataEvidence as DataEvidence,
  };

  return baseDetail;
};

function generateWhyNot(action: string): string[] {
  switch (action) {
    case 'increase':
      return [
        'Không giữ giá vì velocity vượt ngưỡng an toàn.',
        'Không giảm giá vì inventory đang giảm nhanh.',
        'Không tăng mạnh hơn vì cần giữ cạnh tranh.',
      ];
    case 'decrease':
      return [
        'Không giữ giá vì tốc độ bán chậm, cần kích cầu.',
        'Không tăng giá vì sẽ làm giảm thêm nhu cầu.',
        'Không giảm mạnh hơn vì vẫn còn thời gian theo dõi.',
      ];
    case 'hold':
      return [
        'Không tăng giá vì velocity chưa vượt ngưỡng.',
        'Không giảm giá vì không có dấu hiệu tồn kho đáng lo.',
      ];
    default:
      return [
        'Dữ liệu chưa đủ để đưa ra quyết định rõ ràng.',
        'Cần theo dõi thêm trước khi hành động.',
      ];
  }
}

export default function AIPricingRecommendationsPage() {
  const [selectedProperty, setSelectedProperty] = useState<string>("");
  // Default to 40% so users see something by default
  const [minConfidence, setMinConfidence] = useState<number>(0.4);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [feedbackMap, setFeedbackMap] = useState<Record<string, { feedback: 'agree' | 'disagree'; note?: string }>>({});

  // Fetch ALL properties from Channex user properties (no group filter)
  const { data: properties = [], isLoading: propertiesLoading } = useQuery({
    queryKey: ["channex-properties-for-recs-all"],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("channex_user_properties")
        .select("channex_property_id, property_name")
        .order("property_name", { ascending: true });

      if (error) throw error;

      // Ensure unique property IDs
      const map = new Map<string, { channex_property_id: string; property_name: string | null }>();
      (data || []).forEach((p) => {
        if (!p?.channex_property_id) return;
        if (!map.has(p.channex_property_id)) map.set(p.channex_property_id, p);
      });
      return Array.from(map.values());
    },
  });

  // Set default property when loaded
  useEffect(() => {
    if (properties.length > 0 && !selectedProperty) {
      setSelectedProperty(properties[0].channex_property_id);
    }
  }, [properties, selectedProperty]);

  // Use real data hook
  const { 
    recommendationGroups: groups, 
    dayMetrics,
    isLoading: dataLoading, 
    error: dataError 
  } = useAIPricingRecommendations(selectedProperty || null);

  // Filter by confidence
  const filteredGroups = useMemo(() => {
    return groups.filter(g => g.confidence >= minConfidence);
  }, [groups, minConfidence]);

  // Calculate summary stats
  const stats = useMemo(() => {
    const increaseCount = filteredGroups.filter(g => g.action === 'increase').reduce((sum, g) => sum + g.daysCount, 0);
    const holdCount = filteredGroups.filter(g => g.action === 'hold').reduce((sum, g) => sum + g.daysCount, 0);
    const decreaseCount = filteredGroups.filter(g => g.action === 'decrease').reduce((sum, g) => sum + g.daysCount, 0);
    const watchCount = filteredGroups.filter(g => g.action === 'watch').reduce((sum, g) => sum + g.daysCount, 0);
    const totalDays = increaseCount + holdCount + decreaseCount + watchCount;

    // Overall confidence based on weighted average
    const avgConfidence = filteredGroups.length > 0 
      ? filteredGroups.reduce((sum, g) => sum + g.confidence * g.daysCount, 0) / totalDays
      : 0;
    
    const overallConfidence: 'high' | 'medium' | 'low' = 
      avgConfidence >= 0.75 ? 'high' : 
      avgConfidence >= 0.5 ? 'medium' : 'low';

    return { increaseCount, holdCount, decreaseCount, watchCount, totalDays, overallConfidence };
  }, [filteredGroups]);

  // Get detail for selected group
  const selectedDetail = useMemo(() => {
    if (!selectedGroupId) return null;
    const group = groups.find(g => g.id === selectedGroupId);
    if (!group) return null;
    return generateDetailForGroup(group);
  }, [selectedGroupId, groups]);

  useEffect(() => {
    // Clear selection when switching property so UI doesn't keep showing old group's detail
    setSelectedGroupId(null);
  }, [selectedProperty]);

  const handleFeedback = (id: string, feedback: 'agree' | 'disagree', note?: string) => {
    setFeedbackMap(prev => ({
      ...prev,
      [id]: { feedback, note }
    }));
  };

  return (
    <>
      <Header title="AI Pricing Recommendations" subtitle="Đề xuất giá AI" icon={AlertCircle} />
      <PageContainer>
        <SectionCard>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm text-muted-foreground mt-1">
              Clear guidance. Full control. <Badge variant="outline" className="ml-2">Real Data</Badge>
            </p>
          </div>
          
          {/* Property Filter */}
          <div className="flex flex-wrap gap-3">
            {propertiesLoading ? (
              <Skeleton className="h-10 w-[200px]" />
            ) : (
              <Select value={selectedProperty} onValueChange={setSelectedProperty}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Chọn property" />
                </SelectTrigger>
                <SelectContent>
                  {properties.map(p => (
                    <SelectItem key={p.channex_property_id} value={p.channex_property_id}>
                      {p.property_name || p.channex_property_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {/* Data Error Alert */}
        {dataError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Lỗi tải dữ liệu</AlertTitle>
            <AlertDescription>
              Không thể tải dữ liệu pricing. Vui lòng thử lại sau.
            </AlertDescription>
          </Alert>
        )}

        {/* Confidence Filter */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium whitespace-nowrap">Độ tin cậy tối thiểu ≥</span>
              <Slider
                value={[minConfidence * 100]}
                onValueChange={([val]) => setMinConfidence(val / 100)}
                max={100}
                min={40}
                step={5}
                className="flex-1 max-w-xs"
              />
              <span className="text-sm font-bold text-primary w-12">{(minConfidence * 100).toFixed(0)}%</span>
            </div>
          </CardContent>
        </Card>

        {/* Decision Overview */}
        <DecisionOverview
          increaseCount={stats.increaseCount}
          holdCount={stats.holdCount}
          decreaseCount={stats.decreaseCount}
          watchCount={stats.watchCount}
          overallConfidence={stats.overallConfidence}
          totalDays={stats.totalDays}
        />

        {/* Data Stats Card */}
        {dayMetrics.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                📊 Thống kê dữ liệu thực
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const totalSold = dayMetrics.reduce((sum, d) => sum + d.confirmedBookings, 0);
                const totalCapacity = dayMetrics.reduce((sum, d) => sum + d.totalInventory, 0);
                const avgOccupancyWeighted = totalCapacity > 0 ? (totalSold / totalCapacity) * 100 : 0;
                const avgVelocity = dayMetrics.reduce((sum, d) => sum + d.velocity7d, 0) / dayMetrics.length;

                return (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Ngày phân tích:</span>
                      <span className="ml-2 font-medium">{dayMetrics.length}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Avg Occupancy:</span>
                      <span className="ml-2 font-medium">{avgOccupancyWeighted.toFixed(0)}%</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Avg Velocity 7d:</span>
                      <span className="ml-2 font-medium">{avgVelocity.toFixed(2)}/ngày</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Tổng sold (room-nights):</span>
                      <span className="ml-2 font-medium">{totalSold}</span>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        )}

        {/* Recommendation Groups */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Gợi ý theo cụm ngày</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {dataLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">Đang tải dữ liệu...</span>
              </div>
            ) : filteredGroups.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>Không có gợi ý nào với độ tin cậy ≥ {(minConfidence * 100).toFixed(0)}%</p>
                <p className="text-sm mt-1">Hãy thử giảm ngưỡng độ tin cậy hoặc chọn property khác</p>
              </div>
            ) : (
              filteredGroups.map(group => (
                <RecommendationGroup
                  key={group.id}
                  group={group}
                  onViewDetail={setSelectedGroupId}
                />
              ))
            )}
          </CardContent>
        </Card>

        {/* What Recommendations Does NOT do */}
        <WhatRecommendationsDoNot />

        {/* Next Step Navigation */}
        <NextStepNavigation />
      </div>
        </SectionCard>
      </PageContainer>

        {/* Detail Dialog */}
        <RecommendationDetail
          detail={selectedDetail}
          open={!!selectedGroupId}
          onClose={() => setSelectedGroupId(null)}
          onFeedback={handleFeedback}
        />
    </>
  );
}

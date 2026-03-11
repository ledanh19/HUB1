import React, { useState, useMemo } from 'react';
import { PageContainer } from '@/components/layout/PageContainer';
import { SectionCard } from '@/components/layout/SectionCard';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MetricCard } from '@/components/ui/metric-card';
import { KPIGrid } from '@/components/kpi/KPIGrid';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FilterBar } from '@/components/ui/filter-bar';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie } from 'recharts';
import { CheckCircle, XCircle, AlertTriangle, TrendingUp, Target, Shield, Info, FileText, Activity, Lock } from 'lucide-react';
import { useAnGiaPropertiesForPricing } from '@/hooks/useAIPricingInsights';
import {
  useAIPricingValidationData,
  useValidationMetrics,
  assessGoNoGo,
  assessRisks,
  getProductionReadyChecklist,
  type ShadowSignalWithOutcome,
  type GoNoGoStatus
} from '@/hooks/useAIPricingValidation';
import { format, subDays } from 'date-fns';

function getStatusBadgeVariant(status: GoNoGoStatus): "default" | "secondary" | "destructive" {
  switch (status) {
    case 'PASS': return 'default';
    case 'PASS_WITH_CONDITIONS': return 'secondary';
    case 'FAIL': return 'destructive';
  }
}

function getStatusLabel(status: GoNoGoStatus): string {
  switch (status) {
    case 'PASS': return 'Ready for Phase 2';
    case 'PASS_WITH_CONDITIONS': return 'Conditional Pass';
    case 'FAIL': return 'Not Ready';
  }
}

export default function AIPricingValidationPage() {
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('all');
  const [dateRangeDays, setDateRangeDays] = useState<number>(30);

  const { data: properties, isLoading: propertiesLoading } = useAnGiaPropertiesForPricing();

  const dateRange = useMemo(() => ({
    start: format(subDays(new Date(), dateRangeDays), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd'),
  }), [dateRangeDays]);

  const { data: signals, isLoading: signalsLoading } = useAIPricingValidationData(
    selectedPropertyId === 'all' ? undefined : selectedPropertyId,
    dateRange
  );

  const metrics = useValidationMetrics(signals || []);
  const risks = assessRisks(signals || [], metrics);
  const goNoGo = assessGoNoGo(metrics, risks);
  const checklist = getProductionReadyChecklist(metrics, goNoGo);

  const confusionMatrixData = [
    { name: 'True Positive', value: metrics.confusionMatrix.truePositive, color: 'hsl(var(--chart-1))' },
    { name: 'False Positive', value: metrics.confusionMatrix.falsePositive, color: 'hsl(var(--destructive))' },
    { name: 'True Negative', value: metrics.confusionMatrix.trueNegative, color: 'hsl(var(--chart-2))' },
    { name: 'False Negative', value: metrics.confusionMatrix.falseNegative, color: 'hsl(var(--warning))' },
  ];

  const baselineDistData = [
    { name: 'HIGH', value: metrics.baselineReliabilityDistribution.high, fill: 'hsl(var(--chart-1))' },
    { name: 'MEDIUM', value: metrics.baselineReliabilityDistribution.medium, fill: 'hsl(var(--chart-3))' },
    { name: 'LOW', value: metrics.baselineReliabilityDistribution.low, fill: 'hsl(var(--destructive))' },
  ];

  return (
    <>
      <Header title="AI Pricing Validation" subtitle="Kiểm tra xác nhận giá AI" icon={Shield} />
      <PageContainer>
        <SectionCard>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground">Phase 1B+ · Shadow Mode · Evidence-Driven</p>
              </div>
              <Badge variant={getStatusBadgeVariant(goNoGo.status)}>
                {getStatusLabel(goNoGo.status)}
              </Badge>
            </div>

            {/* Disclosure */}
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Shadow validation tracks AI predictions without executing actions. Results show historical accuracy based on actual market outcomes.
                <strong className="ml-1">Insights are based on realized bookings, not total market demand.</strong>
              </AlertDescription>
            </Alert>

            {/* Filters */}
            <FilterBar
              title="Bộ lọc"
              hasActiveFilters={selectedPropertyId !== 'all' || dateRangeDays !== 30}
              onClearFilters={() => { setSelectedPropertyId('all'); setDateRangeDays(30); }}
            >
              <FilterBar.Field label="Property">
                <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
                  <SelectTrigger className="w-[250px]">
                    <SelectValue placeholder="All Properties" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Properties</SelectItem>
                    {properties?.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.property_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterBar.Field>
              <FilterBar.Field label="Thời gian">
                <Select value={String(dateRangeDays)} onValueChange={v => setDateRangeDays(Number(v))}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="14">14 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                  </SelectContent>
                </Select>
              </FilterBar.Field>
            </FilterBar>

            {signalsLoading ? (
              <div className="grid grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32" />)}
              </div>
            ) : (
              <Tabs defaultValue="overview" className="space-y-4">
                <TabsList>
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="risks">Risk Register</TabsTrigger>
                  <TabsTrigger value="checklist">Production Checklist</TabsTrigger>
                </TabsList>

                {/* OVERVIEW TAB */}
                <TabsContent value="overview" className="space-y-4">
                  {/* Executive Summary KPIs */}
                  <KPIGrid columns={4}>
                    <MetricCard title="Accuracy" value={`${Math.round(metrics.accuracyWeighted * 100)}%`} icon={Target} subtitle="Weighted" />
                    <MetricCard title="FP Rate" value={`${Math.round(metrics.falsePositiveRate * 100)}%`} icon={XCircle} subtitle="Target ≤20%" tone="danger" />
                    <MetricCard title="Coverage" value={`${Math.round(metrics.coverageRatio * 100)}%`} icon={Activity} subtitle="Target ≥70%" />
                    <MetricCard title="Signals" value={metrics.evaluatedSignals} icon={TrendingUp} subtitle={`${metrics.pendingSignals} pending`} />
                    <MetricCard title="Sell-out Acc" value={`${Math.round(metrics.selloutRiskAccuracy * 100)}%`} icon={Shield} subtitle="Target ≥70%" />
                  </KPIGrid>

                  {/* Charts Row */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Confusion Matrix */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Confusion Matrix</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="h-[200px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={confusionMatrixData} layout="vertical">
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis type="number" />
                              <YAxis dataKey="name" type="category" width={100} />
                              <Tooltip />
                              <Bar dataKey="value">
                                {confusionMatrixData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Confidence Calibration */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Confidence Calibration</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="h-[200px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={metrics.calibrationData}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="confidenceBucket" />
                              <YAxis domain={[0, 1]} tickFormatter={v => `${Math.round(v * 100)}%`} />
                              <Tooltip formatter={(v: number) => `${Math.round(v * 100)}%`} />
                              <Line type="monotone" dataKey="accuracy" stroke="hsl(var(--primary))" strokeWidth={2} dot />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Data Health & Baseline */}
                  <div className="grid grid-cols-2 gap-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Baseline Reliability Distribution</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="h-[200px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie data={baselineDistData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label />
                              <Tooltip />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Data Health</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex justify-between items-center">
                          <span>Data Lag Issues</span>
                          <Badge variant={metrics.dataLagCount > 0 ? 'destructive' : 'default'}>{metrics.dataLagCount}</Badge>
                        </div>
                        <div className="flex justify-between items-center">
                          <span>Inventory Anomalies</span>
                          <Badge variant={metrics.anomalyCount > 0 ? 'secondary' : 'default'}>{metrics.anomalyCount}</Badge>
                        </div>
                        <div className="flex justify-between items-center">
                          <span>Total Signals</span>
                          <Badge>{metrics.totalSignals}</Badge>
                        </div>
                        <div className="flex justify-between items-center">
                          <span>Pending Evaluation</span>
                          <Badge variant="outline">{metrics.pendingSignals}</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Go/No-Go Checklist */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        Go/No-Go Assessment
                        <Badge variant={getStatusBadgeVariant(goNoGo.status)}>{goNoGo.status.replace('_', ' ')}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {goNoGo.criteria.filter(c => c.isCritical).map((c, i) => (
                          <div key={i} className="flex items-center gap-3">
                            {c.passed ? (
                              <CheckCircle className="h-5 w-5 text-success" />
                            ) : (
                              <XCircle className="h-5 w-5 text-destructive" />
                            )}
                            <div className="flex-1">
                              <div className="font-medium">{c.name}</div>
                              <div className="text-sm text-muted-foreground">{c.description}</div>
                            </div>
                            <div className="text-right">
                              <div className="font-medium">{c.value}{typeof c.threshold === 'number' ? '%' : ''}</div>
                              <div className="text-xs text-muted-foreground">Target: {c.threshold}{typeof c.threshold === 'number' ? '%' : ''}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4">
                        <Progress value={goNoGo.overallScore * 100} className="h-2" />
                        <p className="text-sm text-muted-foreground mt-1">{Math.round(goNoGo.overallScore * 100)}% criteria passed</p>
                      </div>
                      {goNoGo.conditions.length > 0 && (
                        <div className="mt-4 p-3 bg-muted rounded-lg">
                          <p className="font-medium text-sm">Conditions for Approval:</p>
                          <ul className="text-sm text-muted-foreground list-disc list-inside">
                            {goNoGo.conditions.map((c, i) => <li key={i}>{c}</li>)}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* RISKS TAB */}
                <TabsContent value="risks" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5" /> Risk Register (R1-R7)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {risks.map(risk => (
                          <div key={risk.id} className="border rounded-lg p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-3">
                                <Badge variant={risk.status === 'OK' ? 'default' : risk.status === 'WARNING' ? 'secondary' : 'destructive'}>
                                  {risk.id}
                                </Badge>
                                <div>
                                  <h4 className="font-medium">{risk.name}</h4>
                                  <p className="text-sm text-muted-foreground">{risk.description}</p>
                                </div>
                              </div>
                              {risk.autoGateActive && (
                                <Badge variant="outline" className="flex items-center gap-1">
                                  <Lock className="h-3 w-3" /> Auto Blocked
                                </Badge>
                              )}
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <span className="text-muted-foreground">Detection:</span>
                                <p>{risk.detection}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Control:</span>
                                <p>{risk.control}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* CHECKLIST TAB */}
                <TabsContent value="checklist" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5" /> Production-Ready Checklist
                        <Badge variant={checklist.overallStatus === 'READY' ? 'default' : checklist.overallStatus === 'CONDITIONAL' ? 'secondary' : 'destructive'}>
                          {checklist.overallStatus}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {[checklist.technicalIntegrity, checklist.statisticalReliability, checklist.governanceReadiness].map(section => (
                        <div key={section.name}>
                          <div className="flex items-center gap-2 mb-3">
                            {section.passed ? (
                              <CheckCircle className="h-5 w-5 text-success" />
                            ) : (
                              <XCircle className="h-5 w-5 text-destructive" />
                            )}
                            <h3 className="font-semibold">{section.name}</h3>
                          </div>
                          <div className="space-y-2 pl-7">
                            {section.items.map(item => (
                              <div key={item.id} className="flex items-center gap-3">
                                {item.passed ? (
                                  <CheckCircle className="h-4 w-4 text-success" />
                                ) : (
                                  <XCircle className="h-4 w-4 text-destructive" />
                                )}
                                <span className={item.passed ? '' : 'text-destructive'}>{item.name}</span>
                                <span className="text-sm text-muted-foreground ml-auto">{item.details}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  {/* Final Statement */}
                  <Card className="bg-muted/50">
                    <CardContent className="py-6">
                      <blockquote className="italic text-center text-muted-foreground">
                        "An AI pricing system earns the right to automate only after it proves,
                        with evidence, that its confidence aligns with reality over time."
                      </blockquote>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            )}
          </div>
        </SectionCard>
      </PageContainer>
    </>
  );
}

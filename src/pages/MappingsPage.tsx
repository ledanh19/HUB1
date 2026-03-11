import { useState, useMemo } from "react";
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InlineKpiValue } from "@/components/kpi/InlineKpiValue";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertCircle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  RefreshCw,
  Search,
  MoreHorizontal,
  Play,
  Link2,
  Building2,
  BedDouble,
  Tags,
} from "lucide-react";
import {
  usePropertyMappings,
  useRoomTypeMappings,
  useRatePlanMappings,
  useSyncMappingsFromChannex,
  useMappingStats,
  useTestMapping,
  MappingStatus,
} from "@/hooks/useMappings";
import { useCurrentChannexUser, useChannexUserProperties } from "@/hooks/useChannexUser";
import { toast } from "sonner";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { useTablePagination } from "@/hooks/useTablePagination";
import { FilterBar } from "@/components/ui/filter-bar";

const STATUS_CONFIG: Record<MappingStatus, { label: string; color: string; icon: React.ReactNode }> = {
  MAPPED: { label: 'Mapped', color: 'bg-success/10 text-success border-success/20', icon: <CheckCircle2 className="h-4 w-4" /> },
  NOT_MAPPED: { label: 'Not Mapped', color: 'bg-muted text-muted-foreground border-muted', icon: <HelpCircle className="h-4 w-4" /> },
  CONFLICT: { label: 'Conflict', color: 'bg-destructive/10 text-destructive border-destructive/20', icon: <XCircle className="h-4 w-4" /> },
  INVALID: { label: 'Invalid', color: 'bg-warning/10 text-warning border-warning/20', icon: <AlertCircle className="h-4 w-4" /> },
};

function StatusBadge({ status }: { status: MappingStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <Badge variant="outline" className={`${config.color} gap-1`}>
      {config.icon}
      {config.label}
    </Badge>
  );
}

function StatsCard({ title, stats, icon }: {
  title: string;
  stats: Record<string, number>;
  icon: React.ReactNode;
}) {
  const total = Object.values(stats).reduce((a, b) => a + b, 0);
  const mapped = stats.MAPPED || 0;
  const percentage = total > 0 ? Math.round((mapped / total) * 100) : 0;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <InlineKpiValue value={`${mapped}/${total}`} />
          </div>
          <div className="text-right">
            <p className={`text-lg font-semibold ${percentage === 100 ? 'text-success' : percentage > 50 ? 'text-warning' : 'text-destructive'}`}>
              {percentage}%
            </p>
            <p className="text-xs text-muted-foreground">mapped</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function MappingsPage() {
  const [activeTab, setActiveTab] = useState('properties');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>();
  const [selectedRoomTypeId, setSelectedRoomTypeId] = useState<string>();

  // Get Channex user
  const { data: channexUser } = useCurrentChannexUser();

  // Fetch mappings
  const { data: propertyMappings = [], isLoading: propsLoading, refetch: refetchProps } = usePropertyMappings(channexUser?.channex_user_id);
  const { data: roomTypeMappings = [], isLoading: rtLoading, refetch: refetchRT } = useRoomTypeMappings(selectedPropertyId);
  const { data: ratePlanMappings = [], isLoading: rpLoading, refetch: refetchRP } = useRatePlanMappings(selectedRoomTypeId);
  const { data: stats } = useMappingStats(channexUser?.channex_user_id);

  // Mutations
  const syncMutation = useSyncMappingsFromChannex();
  const testMutation = useTestMapping();

  // Filter data
  const filteredProperties = useMemo(() => {
    return propertyMappings.filter(p => {
      const matchesSearch = !searchQuery ||
        p.property_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.channex_property_id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [propertyMappings, searchQuery, statusFilter]);

  const filteredRoomTypes = useMemo(() => {
    return roomTypeMappings.filter(rt => {
      const matchesSearch = !searchQuery ||
        rt.room_type_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        rt.channex_room_type_id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || rt.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [roomTypeMappings, searchQuery, statusFilter]);

  const filteredRatePlans = useMemo(() => {
    return ratePlanMappings.filter(rp => {
      const matchesSearch = !searchQuery ||
        rp.rate_plan_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        rp.channex_rate_plan_id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || rp.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [ratePlanMappings, searchQuery, statusFilter]);

  const propsPagination = useTablePagination(filteredProperties, { defaultPageSize: 10, resetDeps: [searchQuery, statusFilter] });
  const rtPagination = useTablePagination(filteredRoomTypes, { defaultPageSize: 10, resetDeps: [searchQuery, statusFilter, selectedPropertyId] });
  const rpPagination = useTablePagination(filteredRatePlans, { defaultPageSize: 10, resetDeps: [searchQuery, statusFilter, selectedRoomTypeId] });

  const handleSync = () => {
    if (channexUser?.channex_user_id) {
      syncMutation.mutate(channexUser.channex_user_id);
    }
  };

  const handleTestMapping = async (type: 'property' | 'room_type' | 'rate_plan', channexId: string) => {
    try {
      const result = await testMutation.mutateAsync({ type, channexId });
      if (result.valid) {
        toast.success('Mapping is valid');
      } else {
        toast.error(`Invalid: ${result.error}`);
      }
    } catch (error) {
      toast.error('Test failed');
    }
  };

  const handleRefresh = () => {
    refetchProps();
    refetchRT();
    refetchRP();
  };

  return (
    <>
      <Header title="Mappings" subtitle="Quản lý mapping" />
      <PageContainer>
        <SectionCard>
          <div className="space-y-4">
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button onClick={handleSync} disabled={syncMutation.isPending}>
                <Link2 className="h-4 w-4 mr-2" />
                {syncMutation.isPending ? 'Syncing...' : 'Sync from Channex'}
              </Button>
            </div>

            {/* Stats Cards */}
            {stats && (
              <div className="grid grid-cols-3 gap-4">
                <StatsCard
                  title="Property Mappings"
                  stats={stats.properties}
                  icon={<Building2 className="h-5 w-5" />}
                />
                <StatsCard
                  title="Room Type Mappings"
                  stats={stats.roomTypes}
                  icon={<BedDouble className="h-5 w-5" />}
                />
                <StatsCard
                  title="Rate Plan Mappings"
                  stats={stats.ratePlans}
                  icon={<Tags className="h-5 w-5" />}
                />
              </div>
            )}

            {/* Filters */}
            <FilterBar
              title="Bộ lọc"
              subtitle="Tìm kiếm và lọc mapping"
              hasActiveFilters={!!(searchQuery || statusFilter !== 'all')}
              onClearFilters={() => { setSearchQuery(''); setStatusFilter('all'); }}
            >
              <FilterBar.Field label="Tìm kiếm" colSpan={2}>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Tìm theo tên hoặc ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </FilterBar.Field>

              <FilterBar.Field label="Trạng thái">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Trạng thái" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả trạng thái</SelectItem>
                    <SelectItem value="MAPPED">Mapped</SelectItem>
                    <SelectItem value="NOT_MAPPED">Not Mapped</SelectItem>
                    <SelectItem value="CONFLICT">Conflict</SelectItem>
                    <SelectItem value="INVALID">Invalid</SelectItem>
                  </SelectContent>
                </Select>
              </FilterBar.Field>
            </FilterBar>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="properties" className="gap-2">
                  <Building2 className="h-4 w-4" />
                  Properties ({propertyMappings.length})
                </TabsTrigger>
                <TabsTrigger value="roomtypes" className="gap-2">
                  <BedDouble className="h-4 w-4" />
                  Room Types ({roomTypeMappings.length})
                </TabsTrigger>
                <TabsTrigger value="rateplans" className="gap-2">
                  <Tags className="h-4 w-4" />
                  Rate Plans ({ratePlanMappings.length})
                </TabsTrigger>
              </TabsList>

              {/* Properties Tab */}
              <TabsContent value="properties">
                <Card>
                  <CardContent className="p-0">
                    {propsLoading ? (
                      <div className="p-8 space-y-4">
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                      </div>
                    ) : (
                      <>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[200px]">Property Name</TableHead>
                              <TableHead className="w-[150px]">Channex ID</TableHead>
                              <TableHead className="w-[150px]">Roomrise Property</TableHead>
                              <TableHead className="w-[100px]">Status</TableHead>
                              <TableHead className="w-[150px]">Last Validated</TableHead>
                              <TableHead className="w-[100px]">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {propsPagination.paginatedData.map(prop => (
                              <TableRow
                                key={prop.id}
                                className="cursor-pointer hover:bg-muted/50"
                                onClick={() => {
                                  setSelectedPropertyId(prop.id);
                                  setActiveTab('roomtypes');
                                }}
                              >
                                <TableCell className="font-medium">
                                  {prop.property_name || 'Unnamed'}
                                </TableCell>
                                <TableCell className="font-mono text-xs">
                                  {prop.channex_property_id.slice(0, 8)}...
                                </TableCell>
                                <TableCell>
                                  {prop.internal_property_id ? (
                                    <Badge variant="outline">Linked</Badge>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <StatusBadge status={prop.status} />
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {prop.last_validated_at ? new Date(prop.last_validated_at).toLocaleString('en-GB') : '-'}
                                </TableCell>
                                <TableCell>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                      <Button variant="ghost" size="icon">
                                        <MoreHorizontal className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem onClick={(e) => {
                                        e.stopPropagation();
                                        handleTestMapping('property', prop.channex_property_id);
                                      }}>
                                        <Play className="h-4 w-4 mr-2" />
                                        Test Mapping
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </TableCell>
                              </TableRow>
                            ))}
                            {filteredProperties.length === 0 && (
                              <TableRow>
                                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                  No property mappings found. Click "Sync from Channex" to import.
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                        <DataTablePagination
                          currentPage={propsPagination.page}
                          totalPages={propsPagination.totalPages}
                          totalItems={propsPagination.totalCount}
                          displayedItems={propsPagination.displayedCount}
                          pageSize={propsPagination.pageSize}
                          onPageChange={propsPagination.setPage}
                          onPageSizeChange={propsPagination.setPageSize}
                          itemLabel="mapping"
                        />
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Room Types Tab */}
              <TabsContent value="roomtypes">
                <Card>
                  <CardHeader className="pb-4">
                    <div className="flex items-center gap-4">
                      <Select value={selectedPropertyId || ''} onValueChange={setSelectedPropertyId}>
                        <SelectTrigger className="w-[300px]">
                          <SelectValue placeholder="Select property to filter" />
                        </SelectTrigger>
                        <SelectContent>
                          {propertyMappings.map(p => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.property_name || p.channex_property_id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {rtLoading ? (
                      <div className="p-8 space-y-4">
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                      </div>
                    ) : (
                      <>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[200px]">Room Type Name</TableHead>
                              <TableHead className="w-[150px]">Channex ID</TableHead>
                              <TableHead className="w-[100px]">Occupancy</TableHead>
                              <TableHead className="w-[150px]">Roomrise Room Type</TableHead>
                              <TableHead className="w-[100px]">Status</TableHead>
                              <TableHead className="w-[100px]">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {rtPagination.paginatedData.map(rt => (
                              <TableRow
                                key={rt.id}
                                className="cursor-pointer hover:bg-muted/50"
                                onClick={() => {
                                  setSelectedRoomTypeId(rt.id);
                                  setActiveTab('rateplans');
                                }}
                              >
                                <TableCell className="font-medium">
                                  {rt.room_type_name || 'Unnamed'}
                                </TableCell>
                                <TableCell className="font-mono text-xs">
                                  {rt.channex_room_type_id.slice(0, 8)}...
                                </TableCell>
                                <TableCell>{rt.occupancy || '-'}</TableCell>
                                <TableCell>
                                  {rt.internal_room_type_id ? (
                                    <Badge variant="outline">Linked</Badge>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <StatusBadge status={rt.status} />
                                </TableCell>
                                <TableCell>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                      <Button variant="ghost" size="icon">
                                        <MoreHorizontal className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem onClick={(e) => {
                                        e.stopPropagation();
                                        handleTestMapping('room_type', rt.channex_room_type_id);
                                      }}>
                                        <Play className="h-4 w-4 mr-2" />
                                        Test Mapping
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </TableCell>
                              </TableRow>
                            ))}
                            {filteredRoomTypes.length === 0 && (
                              <TableRow>
                                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                  {selectedPropertyId ? 'No room types for this property' : 'Select a property to view room types'}
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                        <DataTablePagination
                          currentPage={rtPagination.page}
                          totalPages={rtPagination.totalPages}
                          totalItems={rtPagination.totalCount}
                          displayedItems={rtPagination.displayedCount}
                          pageSize={rtPagination.pageSize}
                          onPageChange={rtPagination.setPage}
                          onPageSizeChange={rtPagination.setPageSize}
                          itemLabel="mapping"
                        />
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Rate Plans Tab */}
              <TabsContent value="rateplans">
                <Card>
                  <CardHeader className="pb-4">
                    <div className="flex items-center gap-4">
                      <Select value={selectedPropertyId || ''} onValueChange={(v) => {
                        setSelectedPropertyId(v);
                        setSelectedRoomTypeId(undefined);
                      }}>
                        <SelectTrigger className="w-[300px]">
                          <SelectValue placeholder="Select property" />
                        </SelectTrigger>
                        <SelectContent>
                          {propertyMappings.map(p => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.property_name || p.channex_property_id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select value={selectedRoomTypeId || ''} onValueChange={setSelectedRoomTypeId}>
                        <SelectTrigger className="w-[300px]">
                          <SelectValue placeholder="Select room type" />
                        </SelectTrigger>
                        <SelectContent>
                          {roomTypeMappings
                            .filter(rt => !selectedPropertyId || rt.property_mapping_id === selectedPropertyId)
                            .map(rt => (
                              <SelectItem key={rt.id} value={rt.id}>
                                {rt.room_type_name || rt.channex_room_type_id}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {rpLoading ? (
                      <div className="p-8 space-y-4">
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                      </div>
                    ) : (
                      <>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[200px]">Rate Plan Name</TableHead>
                              <TableHead className="w-[100px]">Channel</TableHead>
                              <TableHead className="w-[150px]">Channex ID</TableHead>
                              <TableHead className="w-[80px]">Currency</TableHead>
                              <TableHead className="w-[100px]">Status</TableHead>
                              <TableHead className="w-[100px]">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {rpPagination.paginatedData.map(rp => (
                              <TableRow key={rp.id}>
                                <TableCell className="font-medium">
                                  {rp.rate_plan_name || 'Unnamed'}
                                </TableCell>
                                <TableCell>
                                  {rp.channel_code ? (
                                    <Badge variant="secondary" className="capitalize">
                                      {rp.channel_code}
                                    </Badge>
                                  ) : '-'}
                                </TableCell>
                                <TableCell className="font-mono text-xs">
                                  {rp.channex_rate_plan_id.slice(0, 8)}...
                                </TableCell>
                                <TableCell>{rp.currency || 'VND'}</TableCell>
                                <TableCell>
                                  <StatusBadge status={rp.status} />
                                </TableCell>
                                <TableCell>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon">
                                        <MoreHorizontal className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem onClick={() => handleTestMapping('rate_plan', rp.channex_rate_plan_id)}>
                                        <Play className="h-4 w-4 mr-2" />
                                        Test Mapping
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </TableCell>
                              </TableRow>
                            ))}
                            {filteredRatePlans.length === 0 && (
                              <TableRow>
                                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                  {selectedRoomTypeId ? 'No rate plans for this room type' : 'Select a room type to view rate plans'}
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                        <DataTablePagination
                          currentPage={rpPagination.page}
                          totalPages={rpPagination.totalPages}
                          totalItems={rpPagination.totalCount}
                          displayedItems={rpPagination.displayedCount}
                          pageSize={rpPagination.pageSize}
                          onPageChange={rpPagination.setPage}
                          onPageSizeChange={rpPagination.setPageSize}
                          itemLabel="mapping"
                        />
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </SectionCard>
      </PageContainer>
    </>
  );
}

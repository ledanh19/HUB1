import { useState } from "react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CalendarIcon, Plus, Trash2, Play, Loader2 } from "lucide-react";
import {
  useAvailabilityRules,
  useCreateAvailabilityRule,
  useToggleAvailabilityRule,
  useDeleteAvailabilityRule,
  useApplyAvailabilityRules,
  RoomType,
  Channel,
} from "@/hooks/useInventory";

interface AvailabilityRulesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId?: string;
  roomTypes: RoomType[];
  channels: Channel[];
}

const RULE_TYPES = [
  { value: 'min_stay', label: 'Minimum Stay' },
  { value: 'max_stay', label: 'Maximum Stay' },
  { value: 'stop_sell', label: 'Stop Sell' },
  { value: 'cta', label: 'Closed to Arrival' },
  { value: 'ctd', label: 'Closed to Departure' },
  { value: 'rate_modifier', label: 'Rate Modifier' },
];

const DAYS_OF_WEEK = [
  { value: 0, label: 'Su' },
  { value: 1, label: 'Mo' },
  { value: 2, label: 'Tu' },
  { value: 3, label: 'We' },
  { value: 4, label: 'Th' },
  { value: 5, label: 'Fr' },
  { value: 6, label: 'Sa' },
];

export function AvailabilityRulesDialog({
  open,
  onOpenChange,
  propertyId,
  roomTypes,
  channels,
}: AvailabilityRulesDialogProps) {
  const { data: rules = [], isLoading } = useAvailabilityRules(propertyId);
  const createRule = useCreateAvailabilityRule();
  const toggleRule = useToggleAvailabilityRule();
  const deleteRule = useDeleteAvailabilityRule();
  const applyRules = useApplyAvailabilityRules();
  
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newRuleType, setNewRuleType] = useState('');
  const [newStartDate, setNewStartDate] = useState<Date>();
  const [newEndDate, setNewEndDate] = useState<Date>();
  const [newDaysOfWeek, setNewDaysOfWeek] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [newChannels, setNewChannels] = useState<string[]>([]);
  const [newRoomTypes, setNewRoomTypes] = useState<string[]>([]);
  
  const handleCreate = async () => {
    if (!propertyId || !newTitle || !newRuleType) return;
    
    await createRule.mutateAsync({
      property_id: propertyId,
      title: newTitle,
      rule_type: newRuleType,
      start_date: newStartDate ? format(newStartDate, 'yyyy-MM-dd') : null,
      end_date: newEndDate ? format(newEndDate, 'yyyy-MM-dd') : null,
      days_of_week: newDaysOfWeek,
      channels: newChannels,
      room_type_ids: newRoomTypes,
      rate_plan_ids: [],
      rule_value: null,
      priority: 0,
      is_active: true,
      created_by: null,
    });
    
    setShowCreate(false);
    setNewTitle('');
    setNewRuleType('');
    setNewStartDate(undefined);
    setNewEndDate(undefined);
    setNewDaysOfWeek([0, 1, 2, 3, 4, 5, 6]);
    setNewChannels([]);
    setNewRoomTypes([]);
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Availability Rules</DialogTitle>
            {rules.length > 0 && (
              <Button
                variant="default"
                size="sm"
                onClick={() => applyRules.mutate(propertyId)}
                disabled={applyRules.isPending}
              >
                {applyRules.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Apply Rules
              </Button>
            )}
          </div>
        </DialogHeader>
        
        <ScrollArea className="flex-1">
          <div className="space-y-4 pr-4">
            {/* Rules list */}
            {rules.length === 0 && !showCreate ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No rules configured</p>
                <Button className="mt-4" onClick={() => setShowCreate(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Rule
                </Button>
              </div>
            ) : (
              <>
                {rules.map(rule => (
                  <div
                    key={rule.id}
                    className="border rounded-lg p-4 flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{rule.title}</span>
                        <Badge variant={rule.is_active ? 'default' : 'secondary'}>
                          {rule.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                        <Badge variant="outline">
                          {RULE_TYPES.find(t => t.value === rule.rule_type)?.label || rule.rule_type}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {rule.start_date && rule.end_date
                          ? `${format(new Date(rule.start_date), 'dd/MM/yyyy')} - ${format(new Date(rule.end_date), 'dd/MM/yyyy')}`
                          : 'All dates'}
                        {' • '}
                        {rule.channels.length > 0 ? rule.channels.join(', ') : 'All channels'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={rule.is_active}
                        onCheckedChange={(checked) => toggleRule.mutate({ id: rule.id, isActive: checked })}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteRule.mutate(rule.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                
                {!showCreate && (
                  <Button variant="outline" onClick={() => setShowCreate(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Rule
                  </Button>
                )}
              </>
            )}
            
            {/* Create form */}
            {showCreate && (
              <div className="border rounded-lg p-4 space-y-4 bg-muted/50">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Title</Label>
                    <Input
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="Rule name"
                    />
                  </div>
                  <div>
                    <Label>Type</Label>
                    <Select value={newRuleType} onValueChange={setNewRuleType}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {RULE_TYPES.map(type => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Start Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start">
                          <CalendarIcon className="h-4 w-4 mr-2" />
                          {newStartDate ? format(newStartDate, 'dd/MM/yyyy') : 'Select date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={newStartDate}
                          onSelect={setNewStartDate}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div>
                    <Label>End Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start">
                          <CalendarIcon className="h-4 w-4 mr-2" />
                          {newEndDate ? format(newEndDate, 'dd/MM/yyyy') : 'Select date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={newEndDate}
                          onSelect={setNewEndDate}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                
                <div>
                  <Label>Days of Week</Label>
                  <div className="flex gap-2 mt-1">
                    {DAYS_OF_WEEK.map(day => (
                      <Button
                        key={day.value}
                        variant={newDaysOfWeek.includes(day.value) ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => {
                          setNewDaysOfWeek(prev =>
                            prev.includes(day.value)
                              ? prev.filter(d => d !== day.value)
                              : [...prev, day.value]
                          );
                        }}
                      >
                        {day.label}
                      </Button>
                    ))}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Channels</Label>
                    <div className="border rounded p-2 max-h-32 overflow-auto space-y-1 mt-1">
                      {channels.map(ch => (
                        <label key={ch.id} className="flex items-center gap-2 cursor-pointer">
                          <Checkbox
                            checked={newChannels.includes(ch.id)}
                            onCheckedChange={(c) => {
                              setNewChannels(prev =>
                                c ? [...prev, ch.id] : prev.filter(id => id !== ch.id)
                              );
                            }}
                          />
                          <span className="text-sm">{ch.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label>Room Types</Label>
                    <div className="border rounded p-2 max-h-32 overflow-auto space-y-1 mt-1">
                      {roomTypes.map(rt => (
                        <label key={rt.id} className="flex items-center gap-2 cursor-pointer">
                          <Checkbox
                            checked={newRoomTypes.includes(rt.id)}
                            onCheckedChange={(c) => {
                              setNewRoomTypes(prev =>
                                c ? [...prev, rt.id] : prev.filter(id => id !== rt.id)
                              );
                            }}
                          />
                          <span className="text-sm">{rt.room_type_name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowCreate(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreate}
                    disabled={!newTitle || !newRuleType || createRule.isPending}
                  >
                    Create Rule
                  </Button>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

/**
 * TaskCalendarView - Calendar view for tasks by due date
 * 
 * Monthly view: Shows dots on dates with tasks
 * Weekly view: Shows task cards in columns
 * Click date → Filter tasks by that date
 */

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, X } from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  isSameMonth,
  isSameDay,
  isToday,
  startOfDay,
  addWeeks,
} from "date-fns";
import { vi } from "date-fns/locale";
import { OtaTask, OtaTaskPriority } from "@/hooks/useOtaOperations";
import { cn } from "@/lib/utils";

// ============================================================
// TYPES
// ============================================================

interface TaskCalendarViewProps {
  tasks: OtaTask[];
  onTaskClick: (taskId: string) => void;
  onDateFilter?: (date: Date | null) => void; // NEW: callback when date is clicked
}

type ViewMode = "month" | "week";

// ============================================================
// PRIORITY COLORS
// ============================================================

const PRIORITY_COLORS: Record<OtaTaskPriority, string> = {
  URGENT: "bg-destructive/100",
  HIGH: "bg-warning/100",
  MEDIUM: "bg-info/100",
  LOW: "bg-muted-foreground",
};

const PRIORITY_LABELS: Record<OtaTaskPriority, string> = {
  URGENT: "Khẩn cấp",
  HIGH: "Cao",
  MEDIUM: "Trung bình",
  LOW: "Thấp",
};

// ============================================================
// HELPERS
// ============================================================

const getTasksForDate = (tasks: OtaTask[], date: Date) => {
  return tasks.filter((task) => {
    if (!task.due_date) return false;
    return isSameDay(new Date(task.due_date), date);
  });
};

const getDaysInMonth = (date: Date) => {
  const start = startOfWeek(startOfMonth(date), { weekStartsOn: 1 }); // Monday
  const end = endOfWeek(endOfMonth(date), { weekStartsOn: 1 });
  const days: Date[] = [];
  let currentDay = start;
  while (currentDay <= end) {
    days.push(currentDay);
    currentDay = addDays(currentDay, 1);
  }
  return days;
};

const getDaysInWeek = (date: Date) => {
  const start = startOfWeek(date, { weekStartsOn: 1 });
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    days.push(addDays(start, i));
  }
  return days;
};

// ============================================================
// COMPONENT
// ============================================================

export function TaskCalendarView({ tasks, onTaskClick, onDateFilter }: TaskCalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null); // NEW: track selected date

  // Filter tasks with due dates
  const tasksWithDates = useMemo(
    () => tasks.filter((task) => task.due_date && task.status !== "DONE" && task.status !== "CANCELLED"),
    [tasks]
  );

  const days = useMemo(() => {
    return viewMode === "month" ? getDaysInMonth(currentDate) : getDaysInWeek(currentDate);
  }, [currentDate, viewMode]);

  // NEW: Handle date click
  const handleDateClick = (date: Date) => {
    const newSelectedDate = selectedDate && isSameDay(selectedDate, date) ? null : date;
    setSelectedDate(newSelectedDate);
    if (onDateFilter) {
      onDateFilter(newSelectedDate);
    }
  };

  // NEW: Clear filter
  const handleClearFilter = () => {
    setSelectedDate(null);
    if (onDateFilter) {
      onDateFilter(null);
    }
  };

  // ============================================================
  // NAVIGATION
  // ============================================================

  const goToPrevious = () => {
    setCurrentDate((prev) =>
      viewMode === "month" ? addMonths(prev, -1) : addWeeks(prev, -1)
    );
  };

  const goToNext = () => {
    setCurrentDate((prev) =>
      viewMode === "month" ? addMonths(prev, 1) : addWeeks(prev, 1)
    );
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // ============================================================
  // RENDER: MONTH VIEW
  // ============================================================

  const renderMonthView = () => {
    const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    return (
      <div className="space-y-2">
        {/* Weekday Headers */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {weekDays.map((day) => (
            <div
              key={day}
              className="text-center text-xs font-medium text-muted-foreground py-2"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1">
          {days.map((day) => {
            const dayTasks = getTasksForDate(tasksWithDates, day);
            const isCurrentMonth = isSameMonth(day, currentDate);
            const isTodayDate = isToday(day);
            const isSelected = selectedDate && isSameDay(selectedDate, day); // NEW

            return (
              <button
                key={day.toISOString()}
                onClick={() => handleDateClick(day)} // NEW: click to filter
                className={cn(
                  "relative h-20 border rounded-md p-2 text-left transition-all",
                  "hover:bg-accent hover:shadow-sm",
                  !isCurrentMonth && "bg-muted/50 text-muted-foreground",
                  isTodayDate && "border-info border-2",
                  isSelected && "bg-info/10 border-info border-2 shadow-md" // NEW: selected state
                )}
              >
                <div className="text-sm font-medium mb-1">
                  {format(day, "d")}
                </div>
                {dayTasks.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {dayTasks.slice(0, 3).map((task) => (
                      <div
                        key={task.id}
                        className={cn(
                          "w-2 h-2 rounded-full",
                          PRIORITY_COLORS[task.priority]
                        )}
                        title={task.title}
                      />
                    ))}
                    {dayTasks.length > 3 && (
                      <span className="text-micro text-muted-foreground">
                        +{dayTasks.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // ============================================================
  // RENDER: WEEK VIEW
  // ============================================================

  const renderWeekView = () => {
    return (
      <div className="space-y-2">
        {/* Weekday Headers */}
        <div className="grid grid-cols-7 gap-2">
          {days.map((day) => {
            const isTodayDate = isToday(day);
            const isSelected = selectedDate && isSameDay(selectedDate, day); // NEW
            return (
              <button
                key={day.toISOString()}
                onClick={() => handleDateClick(day)} // NEW: click to filter
                className={cn(
                  "text-center py-2 rounded transition-all hover:bg-accent",
                  isTodayDate && "bg-info/10 border border-info/20",
                  isSelected && "bg-info/10 border-2 border-info" // NEW: selected state
                )}
              >
                <div className="text-xs font-medium text-muted-foreground">
                  {format(day, "EEE")}
                </div>
                <div className="text-lg font-semibold">{format(day, "d")}</div>
              </button>
            );
          })}
        </div>

        {/* Task Cards */}
        <div className="grid grid-cols-7 gap-2">
          {days.map((day) => {
            const dayTasks = getTasksForDate(tasksWithDates, day);
            return (
              <div
                key={day.toISOString()}
                className="border rounded-md p-2 min-h-[200px] bg-muted/30"
              >
                <div className="space-y-2">
                  {dayTasks.map((task) => (
                    <button
                      key={task.id}
                      onClick={() => onTaskClick(task.id)}
                      className="w-full text-left p-2 rounded bg-background border hover:shadow-md transition-shadow"
                    >
                      <div className="space-y-1">
                        <div className="flex items-start gap-1">
                          <div
                            className={cn(
                              "w-1.5 h-1.5 rounded-full mt-1",
                              PRIORITY_COLORS[task.priority]
                            )}
                          />
                          <p className="text-xs font-medium line-clamp-2 flex-1">
                            {task.title}
                          </p>
                        </div>
                        {task.assignee_name && (
                          <p className="text-micro text-muted-foreground truncate">
                            {task.assignee_name}
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ============================================================
  // MAIN RENDER
  // ============================================================

  return (
    <div className="space-y-4">
      {/* Header Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={goToPrevious}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={goToToday}>
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={goToNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {/* NEW: Clear filter button */}
          {selectedDate && (
            <Button variant="ghost" size="sm" onClick={handleClearFilter} className="ml-2">
              <X className="h-4 w-4 mr-1" />
              Clear filter
            </Button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">
            {viewMode === "month"
              ? format(currentDate, "MMMM yyyy", { locale: vi })
              : `Week of ${format(days[0], "MMM d")} - ${format(days[6], "MMM d, yyyy")}`}
          </h2>
          {/* NEW: Selected date indicator */}
          {selectedDate && (
            <Badge variant="secondary" className="text-xs">
              Filtered: {format(selectedDate, "MMM d, yyyy")}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === "month" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("month")}
          >
            Month
          </Button>
          <Button
            variant={viewMode === "week" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("week")}
          >
            Week
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs">
        <span className="text-muted-foreground">Priority:</span>
        {Object.entries(PRIORITY_COLORS).map(([priority, color]) => (
          <div key={priority} className="flex items-center gap-1.5">
            <div className={cn("w-2 h-2 rounded-full", color)} />
            <span>{PRIORITY_LABELS[priority as OtaTaskPriority]}</span>
          </div>
        ))}
      </div>

      {/* Calendar Content */}
      {viewMode === "month" ? renderMonthView() : renderWeekView()}

      {/* Empty State */}
      {tasksWithDates.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <CalendarIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No tasks with due dates</p>
        </div>
      )}
    </div>
  );
}

/**
 * TaskTimelineView - Visual timeline for task status progression
 *
 * Shows horizontal timeline: Created → In Progress → Review → Done
 * Highlights current status, shows blocked/cancelled states
 */

import { format } from "date-fns";
import { vi } from "date-fns/locale";
import {
  CheckCircle2,
  Clock,
  Play,
  Eye,
  AlertCircle,
  XCircle,
} from "lucide-react";
import { OtaTaskStatus } from "@/hooks/useOtaOperations";
import { cn } from "@/lib/utils";

interface TaskTimelineViewProps {
  status: OtaTaskStatus;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  updatedAt: string;
}

interface TimelineNode {
  status: OtaTaskStatus;
  label: string;
  icon: typeof Clock;
  date?: string | null;
}

const getTimelineNodes = (
  status: OtaTaskStatus,
  createdAt: string,
  startedAt?: string | null,
  completedAt?: string | null
): TimelineNode[] => {
  if (status === "BLOCKED") {
    return [
      { status: "TODO", label: "Created", icon: Clock, date: createdAt },
      { status: "BLOCKED", label: "Blocked", icon: AlertCircle, date: startedAt },
    ];
  }

  if (status === "CANCELLED") {
    return [
      { status: "TODO", label: "Created", icon: Clock, date: createdAt },
      { status: "CANCELLED", label: "Cancelled", icon: XCircle, date: completedAt },
    ];
  }

  return [
    { status: "TODO", label: "Created", icon: Clock, date: createdAt },
    { status: "IN_PROGRESS", label: "In Progress", icon: Play, date: startedAt },
    { status: "REVIEW", label: "Review", icon: Eye, date: null },
    { status: "DONE", label: "Done", icon: CheckCircle2, date: completedAt },
  ];
};

const getNodeState = (
  nodeStatus: OtaTaskStatus,
  currentStatus: OtaTaskStatus,
  nodeDate?: string | null
): "completed" | "current" | "pending" => {
  const statusOrder: OtaTaskStatus[] = ["TODO", "IN_PROGRESS", "REVIEW", "DONE"];
  const currentIndex = statusOrder.indexOf(currentStatus);
  const nodeIndex = statusOrder.indexOf(nodeStatus);

  if (currentStatus === "BLOCKED" || currentStatus === "CANCELLED") {
    if (nodeStatus === currentStatus) return "current";
    if (nodeDate) return "completed";
    return "pending";
  }

  if (nodeIndex < currentIndex) return "completed";
  if (nodeIndex === currentIndex) return "current";
  return "pending";
};

const formatTimelineDate = (date: string | null | undefined) => {
  if (!date) return null;
  try {
    return format(new Date(date), "dd MMM yyyy, HH:mm", { locale: vi });
  } catch {
    return null;
  }
};

export function TaskTimelineView({
  status,
  createdAt,
  startedAt,
  completedAt,
  updatedAt,
}: TaskTimelineViewProps) {
  const nodes = getTimelineNodes(status, createdAt, startedAt, completedAt);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">Timeline</h3>

      {/* overflow-hidden prevents the connector lines from bleeding outside the card */}
      <div className="relative overflow-hidden">
        <div className="flex items-start justify-between gap-2">
          {nodes.map((node, index) => {
            const nodeState = getNodeState(node.status, status, node.date);
            const Icon = node.icon;
            const isLast = index === nodes.length - 1;

            return (
              <div key={`${node.status}-${index}`} className="flex-1 flex flex-col items-center">
                <div className="relative flex flex-col items-center">
                  {/* Connecting line (before node) */}
                  {index > 0 && (
                    <div
                      className={cn(
                        "absolute top-5 right-1/2 w-full h-0.5",
                        nodeState === "completed"
                          ? "bg-success/100"
                          : nodeState === "current"
                          ? "bg-info/100"
                          : "bg-muted"
                      )}
                      style={{ transform: "translateX(50%)" }}
                    />
                  )}

                  {/* Node */}
                  <div
                    className={cn(
                      "relative z-10 rounded-full p-2 border-2",
                      nodeState === "completed" &&
                        node.status !== "BLOCKED" &&
                        node.status !== "CANCELLED" &&
                        "bg-success/10 border-success",
                      nodeState === "completed" && node.status === "BLOCKED" && "bg-destructive/10 border-destructive",
                      nodeState === "completed" &&
                        node.status === "CANCELLED" &&
                        "bg-muted border-border",
                      nodeState === "current" &&
                        node.status !== "BLOCKED" &&
                        node.status !== "CANCELLED" &&
                        "bg-info/10 border-info",
                      nodeState === "current" && node.status === "BLOCKED" && "bg-destructive/10 border-destructive",
                      nodeState === "current" &&
                        node.status === "CANCELLED" &&
                        "bg-muted border-border",
                      nodeState === "pending" && "bg-muted border-border"
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4",
                        nodeState === "completed" &&
                          node.status !== "BLOCKED" &&
                          node.status !== "CANCELLED" &&
                          "text-success",
                        nodeState === "completed" && node.status === "BLOCKED" && "text-destructive",
                        nodeState === "completed" && node.status === "CANCELLED" && "text-muted-foreground",
                        nodeState === "current" &&
                          node.status !== "BLOCKED" &&
                          node.status !== "CANCELLED" &&
                          "text-info",
                        nodeState === "current" && node.status === "BLOCKED" && "text-destructive",
                        nodeState === "current" && node.status === "CANCELLED" && "text-muted-foreground",
                        nodeState === "pending" && "text-muted-foreground"
                      )}
                    />
                  </div>

                  {/* Connecting line (after node) */}
                  {!isLast && (
                    <div
                      className={cn(
                        "absolute top-5 left-1/2 w-full h-0.5",
                        nodeState === "completed"
                          ? "bg-success/100"
                          : nodeState === "current"
                          ? "bg-muted"
                          : "bg-muted"
                      )}
                      style={{ transform: "translateX(-50%)" }}
                    />
                  )}
                </div>

                <div className="mt-3 text-center">
                  <p
                    className={cn(
                      "text-xs font-medium",
                      nodeState === "completed" && "text-foreground",
                      nodeState === "current" && "text-info font-semibold",
                      nodeState === "pending" && "text-muted-foreground"
                    )}
                  >
                    {node.label}
                  </p>
                  {node.date && (
                    <p className="text-micro text-muted-foreground mt-1">{formatTimelineDate(node.date)}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="text-xs text-muted-foreground text-center pt-2 border-t">
        {status === "BLOCKED" && (
          <span className="text-destructive font-medium">⚠️ Task is currently blocked</span>
        )}
        {status === "CANCELLED" && <span className="text-muted-foreground">Task was cancelled</span>}
        {status !== "BLOCKED" && status !== "CANCELLED" && (
          <span>Last updated: {formatTimelineDate(updatedAt)}</span>
        )}
      </div>
    </div>
  );
}

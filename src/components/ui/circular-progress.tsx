import { cn } from "@/lib/utils";

interface CircularProgressProps {
  value: number;
  max?: number;
  size?: "sm" | "md" | "lg";
  color?: "primary" | "success" | "warning" | "danger" | "info";
  label?: string | number;
  sublabel?: string;
  strokeWidth?: number;
  className?: string;
}

const sizeConfig = {
  sm: { diameter: 60, fontSize: "text-sm", sublabelSize: "text-micro" },
  md: { diameter: 80, fontSize: "text-lg", sublabelSize: "text-micro" },
  lg: { diameter: 100, fontSize: "text-xl", sublabelSize: "text-xs" },
};

const colorConfig = {
  primary: "stroke-primary",
  success: "stroke-success",
  warning: "stroke-warning",
  danger: "stroke-destructive",
  info: "stroke-info",
};

export function CircularProgress({
  value,
  max = 100,
  size = "md",
  color = "primary",
  label,
  sublabel,
  strokeWidth = 3,
  className,
}: CircularProgressProps) {
  const { diameter, fontSize, sublabelSize } = sizeConfig[size];
  const radius = (diameter - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const percentage = Math.min((value / max) * 100, 100);
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg
        width={diameter}
        height={diameter}
        viewBox={`0 0 ${diameter} ${diameter}`}
        className="transform -rotate-90"
      >
        {/* Background circle */}
        <circle
          cx={diameter / 2}
          cy={diameter / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/40"
        />
        {/* Progress circle */}
        <circle
          cx={diameter / 2}
          cy={diameter / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className={cn(colorConfig[color], "transition-all duration-500 ease-out")}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {label !== undefined && (
          <span className={cn("font-semibold text-foreground", fontSize)}>
            {label}
          </span>
        )}
        {sublabel && (
          <span className={cn("text-muted-foreground uppercase tracking-wider", sublabelSize)}>
            {sublabel}
          </span>
        )}
      </div>
    </div>
  );
}

interface CircularProgressCardProps extends CircularProgressProps {
  title?: string;
  items?: { label: string; value: string | number; color?: string }[];
}

export function CircularProgressCard({
  title,
  items,
  ...progressProps
}: CircularProgressCardProps) {
  return (
    <div className="flex flex-col items-center gap-3 p-4">
      <CircularProgress {...progressProps} />
      {title && (
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {title}
        </p>
      )}
      {items && items.length > 0 && (
        <div className="flex flex-col gap-1 text-xs">
          {items.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2">
              {item.color && (
                <span 
                  className="h-2 w-2 rounded-full" 
                  style={{ backgroundColor: item.color }}
                />
              )}
              <span className="text-muted-foreground">{item.label}:</span>
              <span className="font-medium text-foreground">{item.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
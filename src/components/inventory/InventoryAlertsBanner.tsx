import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Bell, CheckCircle, X, AlertCircle } from "lucide-react";
import { useInventoryAlerts, useAcknowledgeAlert, useInventoryHealth } from "@/hooks/useInventoryEnterprise";

interface InventoryAlertsBannerProps {
  propertyId?: string;
}

export function InventoryAlertsBanner({ propertyId }: InventoryAlertsBannerProps) {
  const { data: alerts = [] } = useInventoryAlerts(propertyId);
  const { status, failRate } = useInventoryHealth(propertyId);
  const acknowledgeMutation = useAcknowledgeAlert();

  // Show nothing if healthy and no alerts
  if (status === 'healthy' && alerts.length === 0) return null;

  const criticalAlerts = alerts.filter(a => a.severity === 'critical');
  const warningAlerts = alerts.filter(a => a.severity === 'warning');

  const handleAcknowledge = (alertId: string) => {
    acknowledgeMutation.mutate(alertId);
  };

  return (
    <div className="space-y-2">
      {/* Health Status Banner */}
      {status !== 'healthy' && status !== 'unknown' && (
        <Alert variant={status === 'critical' ? 'destructive' : 'default'} className="border-l-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {status === 'critical' ? (
                <AlertCircle className="h-4 w-4" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
              <div>
                <AlertTitle className="mb-0">
                  {status === 'critical' ? 'System Degraded' : 'Attention Required'}
                </AlertTitle>
                <AlertDescription>
                  Sync fail rate: {failRate}% · {alerts.length} active alert(s)
                </AlertDescription>
              </div>
            </div>
            <Badge variant={status === 'critical' ? 'destructive' : 'secondary'}>
              {status.toUpperCase()}
            </Badge>
          </div>
        </Alert>
      )}

      {/* Individual Alerts */}
      {alerts.slice(0, 3).map(alert => (
        <Alert 
          key={alert.id} 
          variant={alert.severity === 'critical' ? 'destructive' : 'default'}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            <div>
              <AlertTitle className="text-sm mb-0">{alert.alert_type.replace(/_/g, ' ')}</AlertTitle>
              <AlertDescription className="text-xs">{alert.message}</AlertDescription>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleAcknowledge(alert.id)}
            disabled={acknowledgeMutation.isPending}
          >
            <CheckCircle className="h-4 w-4 mr-1" />
            Acknowledge
          </Button>
        </Alert>
      ))}

      {/* Show more link */}
      {alerts.length > 3 && (
        <p className="text-xs text-muted-foreground text-center">
          +{alerts.length - 3} more alerts
        </p>
      )}
    </div>
  );
}

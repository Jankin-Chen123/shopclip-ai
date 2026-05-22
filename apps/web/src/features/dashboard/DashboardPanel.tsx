import type { DashboardResponse } from "@shopclip/shared";
import { BarChart3, Loader2, RefreshCw } from "lucide-react";

import type { AppCopy } from "../../app/i18n";
import { Button } from "../../components/ui/Button";
import { StatusPill } from "../../components/ui/StatusPill";

interface DashboardPanelProps {
  copy: AppCopy["dashboard"];
  dashboard?: DashboardResponse;
  disabled: boolean;
  error?: string;
  isLoading: boolean;
  onLoadDashboard: () => void;
}

const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

const formatNumber = (value: number) => new Intl.NumberFormat("en-US").format(value);

const impactTone = (impact: string) => {
  if (impact === "high") {
    return "success";
  }
  if (impact === "medium") {
    return "warning";
  }
  return "neutral";
};

export const DashboardPanel = ({
  copy,
  dashboard,
  disabled,
  error,
  isLoading,
  onLoadDashboard,
}: DashboardPanelProps) => {
  const funnelMax = Math.max(...(dashboard?.funnel.map((stage) => stage.value) ?? [1]));
  const summary = dashboard?.summary;
  const summaryCards = summary
    ? [
        {
          label: copy.metrics.predictedCompletionRate,
          value: summary.predictedCompletionRate,
        },
        {
          label: copy.metrics.hookStrength,
          value: summary.hookStrength,
        },
        {
          label: copy.metrics.subtitleClarity,
          value: summary.subtitleClarity,
        },
        {
          label: copy.metrics.productFocus,
          value: summary.productFocus,
        },
      ]
    : [];

  return (
    <section className="panel dashboard-panel" id="dashboard" aria-labelledby="dashboard-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{copy.step}</p>
          <h2 id="dashboard-title">{copy.title}</h2>
        </div>
        <Button
          disabled={disabled || isLoading}
          icon={isLoading ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
          onClick={onLoadDashboard}
          variant="primary"
        >
          {copy.load}
        </Button>
      </div>

      {error ? (
        <p className="inline-error" role="alert">
          {error}
        </p>
      ) : null}

      {!dashboard ? (
        <div className="empty-state dashboard-empty">
          <BarChart3 size={28} aria-hidden="true" />
          <strong>{copy.emptyTitle}</strong>
          <span>{copy.emptyBody}</span>
        </div>
      ) : (
        <div className="dashboard-grid">
          <section className="dashboard-summary" aria-label={copy.summaryLabel}>
            {summaryCards.map((metric) => (
              <article className="metric-card" key={metric.label}>
                <span>{metric.label}</span>
                <strong>{formatPercent(metric.value)}</strong>
                <div className="metric-bar" aria-hidden="true">
                  <span style={{ width: formatPercent(metric.value) }} />
                </div>
                <em>{copy.targetLabel}</em>
              </article>
            ))}
          </section>

          <section className="funnel-panel" aria-labelledby="funnel-title">
            <div className="section-heading">
              <h3 id="funnel-title">{copy.funnelTitle}</h3>
              <span>{copy.funnelSubtitle}</span>
            </div>
            <ol className="funnel-list">
              {dashboard.funnel.map((stage) => (
                <li key={stage.stage}>
                  <div>
                    <strong>{stage.stage}</strong>
                    <span>{formatNumber(stage.value)}</span>
                  </div>
                  <div className="funnel-bar" aria-hidden="true">
                    <span style={{ width: `${Math.max(8, (stage.value / funnelMax) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="factor-panel" aria-labelledby="factor-title">
            <div className="section-heading">
              <h3 id="factor-title">{copy.factorsTitle}</h3>
              <span>{copy.factorsSubtitle}</span>
            </div>
            <div className="factor-table-wrap">
              <table className="factor-table">
                <thead>
                  <tr>
                    <th>{copy.factorColumns.factor}</th>
                    <th>{copy.factorColumns.impact}</th>
                    <th>{copy.factorColumns.evidence}</th>
                    <th>{copy.factorColumns.recommendation}</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.factors.map((factor) => (
                    <tr key={factor.id}>
                      <td>{factor.factor}</td>
                      <td>
                        <StatusPill tone={impactTone(factor.expectedImpact)}>
                          {factor.expectedImpact}
                        </StatusPill>
                      </td>
                      <td>{factor.evidence}</td>
                      <td>{factor.recommendation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </section>
  );
};

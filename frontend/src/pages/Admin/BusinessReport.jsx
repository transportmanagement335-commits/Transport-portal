import { useEffect, useState } from "react";
import {
  FaRupeeSign,
  FaArrowUp,
  FaArrowDown,
  FaTruck,
  FaStar,
  FaDownload,
  FaCalendarAlt,
  FaChartLine,
  FaChartBar,
  FaUsers,
  FaUserTie,
  FaRobot,
  FaBolt,
  FaLeaf,
  FaFire,
  FaGasPump,
} from "react-icons/fa";
import { MdInsights, MdTrendingUp } from "react-icons/md";
import Sidebar from "../../components/Admin/Sidebar";
import Topbar from "../../components/Admin/Topbar";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { adminAPI, requireAuth } from "../../api";
import "../../styles/Admin/BusinessReport.css";

const formatINR = (val) => {
  if (val === null || val === undefined || val === "") return "—";
  const num = Number(val);
  if (isNaN(num)) return "—";
  if (num >= 10000000) return `₹${(num / 10000000).toFixed(1)}Cr`;
  if (num >= 100000) return `₹${(num / 100000).toFixed(1)}L`;
  if (num >= 1000) return `₹${(num / 1000).toFixed(1)}K`;
  return `₹${num.toLocaleString("en-IN")}`;
};

const formatPct = (val) => {
  if (val === null || val === undefined || val === "") return null;
  const num = Number(val);
  if (isNaN(num)) return null;
  return num;
};

const Trend = ({ value, suffix = "%" }) => {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  const up = num >= 0;
  return (
    <span className={`br-trend ${up ? "up" : "down"}`}>
      {up ? <FaArrowUp /> : <FaArrowDown />}
      {Math.abs(num)}
      {suffix} vs last month
    </span>
  );
};

const KpiCard = ({ icon, label, value, trend }) => (
  <div className="br-kpi-card">
    <div className="br-kpi-icon">{icon}</div>
    <div className="br-kpi-body">
      <span className="br-kpi-label">{label}</span>
      <span className="br-kpi-value">{value ?? "—"}</span>
      <Trend value={trend} />
    </div>
  </div>
);

const EmptyRow = ({ cols }) => (
  <tr>
    <td colSpan={cols} className="br-empty-row">
      No data available
    </td>
  </tr>
);

export default function BusinessReport() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dateRange, setDateRange] = useState("This Month");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    requireAuth();
    fetchReport();
  }, [dateRange]);

  const fetchReport = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await adminAPI.get(`/reports/business?range=${dateRange}`);
      setReport(res.data);
    } catch (err) {
      setError("Failed to load report. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const kpi = report?.kpi || {};
  const trend = report?.trend || [];
  const insights = report?.aiInsights || [];
  const topClients = report?.topClients || [];
  const topVehicles = report?.topVehicles || [];
  const topDrivers = report?.topDrivers || [];

  return (
    <div  className={`dashboard-content ${
    sidebarOpen ? "sidebar-open" : "sidebar-close"
  }`}>
      <Sidebar sidebarOpen={sidebarOpen} />
      <div className="dashboard-content">
        <Topbar
  sidebarOpen={sidebarOpen}
  setSidebarOpen={setSidebarOpen}
/>
        <div className="br-container">
          {/* Header */}
          <div className="br-header">
            <div className="br-header-left">
              <h1 className="br-title">
                <MdInsights className="br-title-icon" />
                Business Report
              </h1>
              <p className="br-subtitle">
                Comprehensive overview of your business performance with AI
                insights
              </p>
            </div>
            <div className="br-header-right">
              <div className="br-date-select">
                <FaCalendarAlt />
                <select
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value)}
                >
                  <option>This Month</option>
                  <option>Last Month</option>
                  <option>Last 3 Months</option>
                  <option>This Year</option>
                </select>
              </div>
              <button className="br-download-btn">
                <FaDownload />
                Download Report
              </button>
            </div>
          </div>

          {/* {error && <div className="br-error">{error}</div>} */}

          {loading ? (
            <div className="br-loading">
              <div className="br-spinner" />
              <span>Loading report…</span>
            </div>
          ) : (
            <>
              {/* KPI Row */}
              <div className="br-kpi-row">
                <KpiCard
                  icon={<FaRupeeSign />}
                  label="Total Revenue"
                  value={formatINR(kpi.totalRevenue)}
                  trend={formatPct(kpi.revenueTrend)}
                />
                <KpiCard
                  icon={<FaArrowDown />}
                  label="Total Expense"
                  value={formatINR(kpi.totalExpense)}
                  trend={formatPct(kpi.expenseTrend)}
                />
                <KpiCard
                  icon={<FaChartBar />}
                  label="Total Profit"
                  value={formatINR(kpi.totalProfit)}
                  trend={formatPct(kpi.profitTrend)}
                />
                <KpiCard
                  icon={<FaTruck />}
                  label="Trips Completed"
                  value={kpi.tripsCompleted ?? "—"}
                  trend={formatPct(kpi.tripsTrend)}
                />
                <KpiCard
                  icon={<FaStar />}
                  label="Profit Margin"
                  value={
                    kpi.profitMargin != null ? `${kpi.profitMargin}%` : "—"
                  }
                  trend={formatPct(kpi.marginTrend)}
                />
              </div>

              {/* Charts + AI Insights */}
              <div className="br-mid-row">
                {/* Trend Chart */}
                <div className="br-card br-chart-card">
                  <div className="br-card-header">
                    <h2>Revenue, Expense & Profit Trend</h2>
                    <span className="br-card-badge">Monthly</span>
                  </div>
                  {trend.length === 0 ? (
                    <div className="br-chart-empty">No trend data available</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={240}>
                      <LineChart
                        data={trend}
                        margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e8eef4" />
                        <XAxis
                          dataKey="month"
                          tick={{ fontSize: 11, fill: "#6b7a99" }}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: "#6b7a99" }}
                          tickFormatter={(v) => formatINR(v)}
                        />
                        <Tooltip
                          formatter={(v, name) => [formatINR(v), name]}
                          contentStyle={{
                            fontSize: 12,
                            borderRadius: 8,
                            border: "1px solid #e2e8f0",
                          }}
                        />
                        <Legend
                          iconType="circle"
                          wrapperStyle={{ fontSize: 12 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="revenue"
                          stroke="#3b82f6"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          name="Revenue (₹)"
                        />
                        <Line
                          type="monotone"
                          dataKey="expense"
                          stroke="#ef4444"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          name="Expense (₹)"
                        />
                        <Line
                          type="monotone"
                          dataKey="profit"
                          stroke="#22c55e"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          name="Profit (₹)"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* AI Insights */}
                <div className="br-card br-insights-card">
                  <div className="br-card-header">
                    <h2>
                      <MdTrendingUp className="br-insights-icon" />
                      AI Business Insights
                    </h2>
                    <span className="br-badge-ai">AI Generated</span>
                  </div>
                  {insights.length === 0 ? (
                    <div className="br-insights-empty">
                      No insights available for this period.
                    </div>
                  ) : (
                    <ul className="br-insights-list">
                      {insights.map((item, i) => (
                        <li key={i} className={`br-insight-item type-${item.type || "info"}`}>
                          <span className="br-insight-dot" />
                          <span
                            className="br-insight-text"
                            dangerouslySetInnerHTML={{ __html: item.text }}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Bottom Tables */}
              <div className="br-tables-row">
                {/* Top Clients */}
                <div className="br-card br-table-card">
                  <div className="br-card-header">
                    <h2>
                      <FaUsers className="br-th-icon" />
                      Top Performing Clients
                    </h2>
                    <button className="br-view-all">View All</button>
                  </div>
                  <div className="br-table-wrap">
                    <table className="br-table">
                      <thead>
                        <tr>
                          <th>Client Name</th>
                          <th>Trips</th>
                          <th>Revenue</th>
                          <th>Profit</th>
                          <th>Growth</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topClients.length === 0 ? (
                          <EmptyRow cols={5} />
                        ) : (
                          topClients.map((c, i) => (
                            <tr key={i}>
                              <td className="br-td-name">{c.name}</td>
                              <td>{c.trips}</td>
                              <td>{formatINR(c.revenue)}</td>
                              <td>{formatINR(c.profit)}</td>
                              <td>
                                <span
                                  className={`br-growth ${
                                    Number(c.growth) >= 0 ? "up" : "down"
                                  }`}
                                >
                                  {Number(c.growth) >= 0 ? "▲" : "▼"}{" "}
                                  {Math.abs(c.growth)}%
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      {topClients.length > 0 && (
                        <tfoot>
                          <tr className="br-tfoot">
                            <td>Total</td>
                            <td>
                              {topClients.reduce(
                                (s, c) => s + Number(c.trips || 0),
                                0
                              )}
                            </td>
                            <td>
                              {formatINR(
                                topClients.reduce(
                                  (s, c) => s + Number(c.revenue || 0),
                                  0
                                )
                              )}
                            </td>
                            <td>
                              {formatINR(
                                topClients.reduce(
                                  (s, c) => s + Number(c.profit || 0),
                                  0
                                )
                              )}
                            </td>
                            <td />
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>

                {/* Top Vehicles */}
                <div className="br-card br-table-card">
                  <div className="br-card-header">
                    <h2>
                      <FaTruck className="br-th-icon" />
                      Top Performing Vehicles
                    </h2>
                    <button className="br-view-all">View All</button>
                  </div>
                  <div className="br-table-wrap">
                    <table className="br-table">
                      <thead>
                        <tr>
                          <th>Vehicle No.</th>
                          <th>Trips</th>
                          <th>Revenue</th>
                          <th>Profit</th>
                          <th>Utilization</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topVehicles.length === 0 ? (
                          <EmptyRow cols={5} />
                        ) : (
                          topVehicles.map((v, i) => (
                            <tr key={i}>
                              <td className="br-td-name">{v.vehicleNo}</td>
                              <td>{v.trips}</td>
                              <td>{formatINR(v.revenue)}</td>
                              <td>{formatINR(v.profit)}</td>
                              <td>
                                <div className="br-util-wrap">
                                  <div className="br-util-bar">
                                    <div
                                      className="br-util-fill"
                                      style={{
                                        width: `${Math.min(
                                          v.utilization,
                                          100
                                        )}%`,
                                      }}
                                    />
                                  </div>
                                  <span>{v.utilization}%</span>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      {topVehicles.length > 0 && (
                        <tfoot>
                          <tr className="br-tfoot">
                            <td>Total</td>
                            <td>
                              {topVehicles.reduce(
                                (s, v) => s + Number(v.trips || 0),
                                0
                              )}
                            </td>
                            <td>
                              {formatINR(
                                topVehicles.reduce(
                                  (s, v) => s + Number(v.revenue || 0),
                                  0
                                )
                              )}
                            </td>
                            <td>
                              {formatINR(
                                topVehicles.reduce(
                                  (s, v) => s + Number(v.profit || 0),
                                  0
                                )
                              )}
                            </td>
                            <td />
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>

                {/* Top Drivers */}
                <div className="br-card br-table-card">
                  <div className="br-card-header">
                    <h2>
                      <FaUserTie className="br-th-icon" />
                      Top Performing Drivers
                    </h2>
                    <button className="br-view-all">View All</button>
                  </div>
                  <div className="br-table-wrap">
                    <table className="br-table">
                      <thead>
                        <tr>
                          <th>Driver Name</th>
                          <th>Trips</th>
                          <th>KM</th>
                          <th>Revenue</th>
                          <th>Rating</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topDrivers.length === 0 ? (
                          <EmptyRow cols={5} />
                        ) : (
                          topDrivers.map((d, i) => (
                            <tr key={i}>
                              <td className="br-td-name">{d.name}</td>
                              <td>{d.trips}</td>
                              <td>
                                {d.kmDriven
                                  ? Number(d.kmDriven).toLocaleString("en-IN")
                                  : "—"}
                              </td>
                              <td>{formatINR(d.revenue)}</td>
                              <td>
                                <span className="br-rating">
                                  <FaStar className="br-star" />
                                  {d.rating ?? "—"}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      {topDrivers.length > 0 && (
                        <tfoot>
                          <tr className="br-tfoot">
                            <td>Total</td>
                            <td>
                              {topDrivers.reduce(
                                (s, d) => s + Number(d.trips || 0),
                                0
                              )}
                            </td>
                            <td>
                              {topDrivers
                                .reduce(
                                  (s, d) => s + Number(d.kmDriven || 0),
                                  0
                                )
                                .toLocaleString("en-IN")}
                            </td>
                            <td>
                              {formatINR(
                                topDrivers.reduce(
                                  (s, d) => s + Number(d.revenue || 0),
                                  0
                                )
                              )}
                            </td>
                            <td />
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

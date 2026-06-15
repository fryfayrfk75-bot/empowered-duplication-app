import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const res = await admin.graphql(`#graphql
    query analytics {
      orders(first: 250, sortKey: CREATED_AT, reverse: true) {
        edges {
          node {
            id name createdAt
            displayFinancialStatus displayFulfillmentStatus
            totalPriceSet { shopMoney { amount currencyCode } }
            subtotalPriceSet { shopMoney { amount } }
            totalShippingPriceSet { shopMoney { amount } }
            lineItems(first: 10) {
              edges {
                node {
                  title quantity
                  originalUnitPriceSet { shopMoney { amount } }
                  variant { id title }
                }
              }
            }
            customAttributes { key value }
          }
        }
      }
      shop { currencyCode }
    }
  `);

  const data = await res.json();
  const allOrders = data.data.orders.edges.map((e) => e.node);
  const currency = data.data.shop.currencyCode;

  const paid = allOrders.filter((o) => o.displayFinancialStatus === "PAID");
  const totalRevenue = paid.reduce((s, o) => s + parseFloat(o.totalPriceSet.shopMoney.amount), 0);
  const totalShipping = paid.reduce((s, o) => s + parseFloat(o.totalShippingPriceSet?.shopMoney?.amount || 0), 0);
  const avgOrder = paid.length ? totalRevenue / paid.length : 0;

  // Revenue by day (last 14 days)
  const today = new Date();
  const dayRevenue = {};
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    dayRevenue[key] = 0;
  }
  paid.forEach((o) => {
    const day = o.createdAt.split("T")[0];
    if (dayRevenue[day] !== undefined) {
      dayRevenue[day] += parseFloat(o.totalPriceSet.shopMoney.amount);
    }
  });

  // Top products
  const productMap = {};
  allOrders.forEach((o) => {
    o.lineItems.edges.forEach(({ node: item }) => {
      const key = item.title;
      if (!productMap[key]) productMap[key] = { title: key, units: 0, revenue: 0 };
      productMap[key].units += item.quantity;
      productMap[key].revenue += parseFloat(item.originalUnitPriceSet?.shopMoney?.amount || 0) * item.quantity;
    });
  });
  const topProducts = Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 8);

  // Orders by wilaya
  const wilayaMap = {};
  allOrders.forEach((o) => {
    const w = o.customAttributes?.find((a) => a.key === "Wilaya")?.value || "أخرى";
    if (!wilayaMap[w]) wilayaMap[w] = { wilaya: w, count: 0, revenue: 0 };
    wilayaMap[w].count++;
    wilayaMap[w].revenue += parseFloat(o.totalPriceSet.shopMoney.amount);
  });
  const topWilayas = Object.values(wilayaMap).sort((a, b) => b.count - a.count).slice(0, 8);

  // Status breakdown
  const statusCount = {};
  allOrders.forEach((o) => {
    const k = o.displayFulfillmentStatus;
    statusCount[k] = (statusCount[k] || 0) + 1;
  });

  return {
    currency, totalRevenue, totalShipping, avgOrder,
    totalOrders: allOrders.length, paidOrders: paid.length,
    dayRevenue, topProducts, topWilayas, statusCount,
  };
};

function MetricCard({ title, value, sub, color }) {
  return (
    <div style={{ background: "#1a1a1a", border: `1px solid ${color}33`, borderTop: `3px solid ${color}`, borderRadius: 10, padding: "20px 24px", flex: 1, minWidth: 160 }}>
      <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

const STATUS_AR = { FULFILLED: "مشحون", UNFULFILLED: "غير مشحون", PARTIALLY_FULFILLED: "جزئي", IN_PROGRESS: "جاري", SCHEDULED: "مجدول" };
const STATUS_COLOR = { FULFILLED: "#22c55e", UNFULFILLED: "#ef4444", PARTIALLY_FULFILLED: "#f59e0b", IN_PROGRESS: "#3b82f6", SCHEDULED: "#8b5cf6" };

export default function Analytics() {
  const { currency, totalRevenue, totalShipping, avgOrder, totalOrders, paidOrders, dayRevenue, topProducts, topWilayas, statusCount } = useLoaderData();

  const days = Object.entries(dayRevenue);
  const maxDay = Math.max(...days.map(([, v]) => v), 1);

  const maxProduct = Math.max(...topProducts.map((p) => p.revenue), 1);
  const maxWilaya = Math.max(...topWilayas.map((w) => w.count), 1);

  return (
    <s-page heading="التحليلات والإحصائيات">

      {/* KPIs */}
      <s-section heading="الأرقام الرئيسية">
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <MetricCard title="إجمالي الإيرادات" value={`${totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${currency}`} sub="الطلبات المدفوعة فقط" color="#C9A96E" />
          <MetricCard title="إجمالي الطلبات" value={totalOrders} sub={`${paidOrders} مدفوع`} color="#3b82f6" />
          <MetricCard title="متوسط قيمة الطلب" value={`${avgOrder.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${currency}`} sub="AOV" color="#22c55e" />
          <MetricCard title="إيرادات التوصيل" value={`${totalShipping.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${currency}`} sub="رسوم الشحن" color="#8b5cf6" />
        </div>
      </s-section>

      {/* Revenue Chart (14 days) */}
      <s-section heading="الإيرادات — آخر 14 يوم">
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 140, padding: "0 4px" }}>
          {days.map(([day, value]) => {
            const pct = (value / maxDay) * 100;
            const label = day.slice(5);
            return (
              <div key={day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ fontSize: 9, color: value > 0 ? "#C9A96E" : "#333" }}>
                  {value > 0 ? value.toLocaleString(undefined, { maximumFractionDigits: 0 }) : ""}
                </div>
                <div title={`${day}: ${value}`} style={{ width: "100%", height: `${Math.max(pct, 2)}%`, background: value > 0 ? "linear-gradient(180deg, #C9A96E, #8B6914)" : "#1e1e1e", borderRadius: "4px 4px 0 0", transition: "height 0.3s", minHeight: 4 }} />
                <div style={{ fontSize: 9, color: "#555", transform: "rotate(-45deg)", whiteSpace: "nowrap" }}>{label}</div>
              </div>
            );
          })}
        </div>
      </s-section>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
        {/* Top Products */}
        <s-section heading="أفضل المنتجات مبيعاً">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {topProducts.map((p, i) => (
              <div key={p.title}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 13 }}>
                  <span style={{ color: "#ccc" }}>{i + 1}. {p.title}</span>
                  <span style={{ color: "#C9A96E", fontWeight: 700 }}>{p.units} وحدة</span>
                </div>
                <div style={{ height: 6, background: "#1a1a1a", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(p.revenue / maxProduct) * 100}%`, background: "linear-gradient(90deg, #C9A96E, #8B6914)", borderRadius: 3 }} />
                </div>
                <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{p.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })} {currency}</div>
              </div>
            ))}
          </div>
        </s-section>

        {/* Top Wilayas */}
        <s-section heading="أكثر الولايات طلباً">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {topWilayas.map((w, i) => (
              <div key={w.wilaya}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 13 }}>
                  <span style={{ color: "#ccc" }}>{i + 1}. {w.wilaya}</span>
                  <span style={{ color: "#3b82f6", fontWeight: 700 }}>{w.count} طلب</span>
                </div>
                <div style={{ height: 6, background: "#1a1a1a", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(w.count / maxWilaya) * 100}%`, background: "linear-gradient(90deg, #3b82f6, #1d4ed8)", borderRadius: 3 }} />
                </div>
                <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{w.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })} {currency}</div>
              </div>
            ))}
          </div>
        </s-section>
      </div>

      {/* Fulfillment Status Breakdown */}
      <s-section heading="توزيع حالة الشحن">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {Object.entries(statusCount).map(([status, count]) => {
            const color = STATUS_COLOR[status] || "#888";
            const label = STATUS_AR[status] || status;
            const pct = totalOrders ? ((count / totalOrders) * 100).toFixed(1) : 0;
            return (
              <div key={status} style={{ background: color + "15", border: `1px solid ${color}33`, borderRadius: 10, padding: "16px 20px", flex: 1, minWidth: 120 }}>
                <div style={{ fontSize: 11, color, fontWeight: 700, marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 28, fontWeight: 800, color }}>{count}</div>
                <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>{pct}% من الكل</div>
              </div>
            );
          })}
        </div>
      </s-section>

    </s-page>
  );
}

export const headers = (h) => boundary.headers(h);

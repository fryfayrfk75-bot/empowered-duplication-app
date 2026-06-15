import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const res = await admin.graphql(`#graphql
    query dashboard {
      orders(first: 5, sortKey: CREATED_AT, reverse: true) {
        edges {
          node {
            id
            name
            createdAt
            displayFinancialStatus
            displayFulfillmentStatus
            totalPriceSet { shopMoney { amount currencyCode } }
            customer { firstName lastName }
            customAttributes { key value }
          }
        }
        pageInfo { hasNextPage }
      }
      recentOrders: orders(first: 250, query: "created_at:>2020-01-01") {
        edges {
          node {
            id
            totalPriceSet { shopMoney { amount currencyCode } }
            displayFinancialStatus
            displayFulfillmentStatus
          }
        }
      }
      products(first: 1) { edges { node { id } } }
      shop {
        name
        myshopifyDomain
        plan { displayName }
        currencyCode
      }
      productsCount: productsCount { count }
      customersCount: customersCount { count }
    }
  `);

  const data = await res.json();
  const { orders, recentOrders, shop, productsCount, customersCount } = data.data;

  const allOrders = recentOrders.edges.map((e) => e.node);
  const totalRevenue = allOrders
    .filter((o) => o.displayFinancialStatus === "PAID")
    .reduce((sum, o) => sum + parseFloat(o.totalPriceSet.shopMoney.amount), 0);

  const unfulfilled = allOrders.filter(
    (o) => o.displayFulfillmentStatus === "UNFULFILLED"
  ).length;

  return {
    shop,
    totalOrders: allOrders.length,
    totalRevenue: totalRevenue.toFixed(2),
    currency: allOrders[0]?.totalPriceSet?.shopMoney?.currencyCode || shop.currencyCode,
    unfulfilled,
    productsCount: productsCount.count,
    customersCount: customersCount.count,
    recentOrders: orders.edges.map((e) => e.node),
  };
};

const STATUS_COLORS = {
  PAID: "#22c55e",
  PENDING: "#f59e0b",
  REFUNDED: "#ef4444",
  PARTIALLY_PAID: "#f59e0b",
  VOIDED: "#6b7280",
  FULFILLED: "#22c55e",
  UNFULFILLED: "#ef4444",
  PARTIALLY_FULFILLED: "#f59e0b",
  IN_PROGRESS: "#3b82f6",
  SCHEDULED: "#8b5cf6",
};

const statusLabel = (s) =>
  ({
    PAID: "مدفوع",
    PENDING: "معلق",
    REFUNDED: "مسترد",
    PARTIALLY_PAID: "مدفوع جزئياً",
    VOIDED: "ملغى",
    FULFILLED: "مشحون",
    UNFULFILLED: "غير مشحون",
    PARTIALLY_FULFILLED: "مشحون جزئياً",
    IN_PROGRESS: "جاري",
  }[s] || s);

function MetricCard({ title, value, sub, color }) {
  return (
    <div style={{
      background: "#1a1a1a",
      border: `1px solid ${color}33`,
      borderTop: `3px solid ${color}`,
      borderRadius: 10,
      padding: "20px 24px",
      flex: 1,
      minWidth: 160,
    }}>
      <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Badge({ status }) {
  const color = STATUS_COLORS[status] || "#888";
  return (
    <span style={{
      background: color + "22",
      color,
      border: `1px solid ${color}55`,
      borderRadius: 4,
      padding: "2px 8px",
      fontSize: 11,
      fontWeight: 600,
    }}>
      {statusLabel(status)}
    </span>
  );
}

export default function Dashboard() {
  const { shop, totalOrders, totalRevenue, currency, unfulfilled, productsCount, customersCount, recentOrders } = useLoaderData();

  return (
    <s-page heading={`مرحباً — ${shop.name}`}>
      {/* Metric Cards */}
      <s-section>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <MetricCard title="إجمالي الإيرادات" value={`${parseFloat(totalRevenue).toLocaleString()} ${currency}`} sub="الطلبات المدفوعة" color="#C9A96E" />
          <MetricCard title="إجمالي الطلبات" value={totalOrders} sub="كل الطلبات" color="#3b82f6" />
          <MetricCard title="غير مشحون" value={unfulfilled} sub="يحتاج إجراء" color="#ef4444" />
          <MetricCard title="المنتجات" value={productsCount} sub="في المتجر" color="#22c55e" />
          <MetricCard title="العملاء" value={customersCount} sub="مسجلون" color="#8b5cf6" />
        </div>
      </s-section>

      {/* Recent Orders */}
      <s-section heading="آخر الطلبات">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #333" }}>
                {["رقم الطلب", "العميل", "التاريخ", "الدفع", "الشحن", "المبلغ"].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "right", color: "#888", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((order) => {
                const wilaya = order.customAttributes?.find((a) => a.key === "Wilaya")?.value;
                const name = order.customer
                  ? `${order.customer.firstName || ""} ${order.customer.lastName || ""}`.trim()
                  : wilaya || "—";
                return (
                  <tr key={order.id} style={{ borderBottom: "1px solid #222" }}>
                    <td style={{ padding: "12px 14px" }}>
                      <a href={`/app/orders/${order.id.split("/").pop()}`} style={{ color: "#C9A96E", textDecoration: "none", fontWeight: 700 }}>
                        {order.name}
                      </a>
                    </td>
                    <td style={{ padding: "12px 14px", color: "#ccc" }}>{name}</td>
                    <td style={{ padding: "12px 14px", color: "#888" }}>
                      {new Date(order.createdAt).toLocaleDateString("ar-DZ")}
                    </td>
                    <td style={{ padding: "12px 14px" }}><Badge status={order.displayFinancialStatus} /></td>
                    <td style={{ padding: "12px 14px" }}><Badge status={order.displayFulfillmentStatus} /></td>
                    <td style={{ padding: "12px 14px", color: "#C9A96E", fontWeight: 700 }}>
                      {parseFloat(order.totalPriceSet.shopMoney.amount).toLocaleString()} {order.totalPriceSet.shopMoney.currencyCode}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {recentOrders.length === 0 && (
            <div style={{ padding: 40, textAlign: "center", color: "#555" }}>لا توجد طلبات بعد</div>
          )}
        </div>
        <div style={{ marginTop: 16 }}>
          <a href="/app/orders" style={{ color: "#C9A96E", fontSize: 13, textDecoration: "none" }}>عرض كل الطلبات ←</a>
        </div>
      </s-section>

      {/* Quick Links */}
      <s-section heading="روابط سريعة" slot="aside">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { label: "إدارة الطلبات", href: "/app/orders", color: "#3b82f6" },
            { label: "إدارة المنتجات", href: "/app/products", color: "#22c55e" },
            { label: "العملاء", href: "/app/customers", color: "#8b5cf6" },
            { label: "المخزون", href: "/app/inventory", color: "#f59e0b" },
            { label: "التحليلات", href: "/app/analytics", color: "#C9A96E" },
          ].map((l) => (
            <a key={l.href} href={l.href} style={{
              display: "block", padding: "10px 16px",
              background: l.color + "15", border: `1px solid ${l.color}33`,
              borderRadius: 8, color: l.color, textDecoration: "none",
              fontWeight: 600, fontSize: 13,
            }}>{l.label} →</a>
          ))}
        </div>
      </s-section>

      {/* Store Info */}
      <s-section heading="معلومات المتجر" slot="aside">
        <div style={{ fontSize: 13, color: "#888", lineHeight: 2 }}>
          <div><strong style={{ color: "#ccc" }}>المتجر:</strong> {shop.name}</div>
          <div><strong style={{ color: "#ccc" }}>الدومين:</strong> {shop.myshopifyDomain}</div>
          <div><strong style={{ color: "#ccc" }}>الخطة:</strong> {shop.plan?.displayName}</div>
          <div><strong style={{ color: "#ccc" }}>العملة:</strong> {currency}</div>
        </div>
      </s-section>
    </s-page>
  );
}

export const headers = (h) => boundary.headers(h);

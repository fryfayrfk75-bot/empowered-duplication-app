import { useLoaderData, useFetcher, useSearchParams } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const filter = url.searchParams.get("filter") || "ALL";
  const search = url.searchParams.get("q") || "";

  let query = `first: 50, sortKey: CREATED_AT, reverse: true`;
  const conditions = [];
  if (filter === "UNFULFILLED") conditions.push("fulfillment_status:unshipped");
  if (filter === "PAID") conditions.push("financial_status:paid");
  if (filter === "PENDING") conditions.push("financial_status:pending");
  if (search) conditions.push(`name:*${search}*`);
  if (conditions.length) query += `, query: "${conditions.join(" AND ")}"`;

  const res = await admin.graphql(`#graphql
    query orders {
      orders(${query}) {
        edges {
          node {
            id name createdAt displayFinancialStatus displayFulfillmentStatus
            totalPriceSet { shopMoney { amount currencyCode } }
            customer { firstName lastName phone email }
            customAttributes { key value }
            lineItems(first: 5) {
              edges { node { title quantity variant { title } } }
            }
            shippingAddress { city province country }
          }
        }
      }
    }
  `);

  const data = await res.json();
  return { orders: data.data.orders.edges.map((e) => e.node), filter, search };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");
  const orderId = form.get("orderId");

  if (intent === "fulfill") {
    const lineItems = JSON.parse(form.get("lineItems"));
    await admin.graphql(`#graphql
      mutation fulfill($fulfillment: FulfillmentInput!) {
        fulfillmentCreate(fulfillment: $fulfillment) {
          fulfillment { id status }
          userErrors { field message }
        }
      }`, {
      variables: {
        fulfillment: {
          lineItemsByFulfillmentOrder: lineItems,
          notifyCustomer: true,
        },
      },
    });
    return { success: true, action: "fulfilled" };
  }

  if (intent === "cancel") {
    await admin.graphql(`#graphql
      mutation cancel($orderId: ID!, $reason: OrderCancelReason!, $refund: Boolean!, $restock: Boolean!) {
        orderCancel(orderId: $orderId, reason: $reason, refund: $refund, restock: $restock) {
          job { id }
          userErrors { field message }
        }
      }`, {
      variables: {
        orderId,
        reason: "CUSTOMER",
        refund: false,
        restock: true,
      },
    });
    return { success: true, action: "cancelled" };
  }

  return { success: false };
};

const STATUS_COLORS = {
  PAID: "#22c55e", PENDING: "#f59e0b", REFUNDED: "#ef4444",
  PARTIALLY_PAID: "#f59e0b", VOIDED: "#6b7280",
  FULFILLED: "#22c55e", UNFULFILLED: "#ef4444",
  PARTIALLY_FULFILLED: "#f59e0b", IN_PROGRESS: "#3b82f6",
};

const arLabel = (s) => ({
  PAID: "مدفوع", PENDING: "معلق", REFUNDED: "مسترد", PARTIALLY_PAID: "مدفوع جزئياً",
  VOIDED: "ملغى", FULFILLED: "مشحون", UNFULFILLED: "غير مشحون",
  PARTIALLY_FULFILLED: "مشحون جزئياً", IN_PROGRESS: "جاري",
}[s] || s);

function Badge({ status }) {
  const c = STATUS_COLORS[status] || "#888";
  return (
    <span style={{ background: c + "22", color: c, border: `1px solid ${c}55`, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>
      {arLabel(status)}
    </span>
  );
}

const FILTERS = [
  { key: "ALL", label: "الكل" },
  { key: "UNFULFILLED", label: "غير مشحون" },
  { key: "PAID", label: "مدفوع" },
  { key: "PENDING", label: "معلق" },
];

export default function Orders() {
  const { orders, filter, search } = useLoaderData();
  const fetcher = useFetcher();
  const [, setParams] = useSearchParams();

  return (
    <s-page heading="الطلبات">
      {/* Filter Bar */}
      <s-section>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {FILTERS.map((f) => (
            <button key={f.key}
              onClick={() => setParams({ filter: f.key, q: search })}
              style={{
                padding: "6px 16px", borderRadius: 20, fontSize: 13, fontWeight: 600,
                border: filter === f.key ? "2px solid #C9A96E" : "1px solid #333",
                background: filter === f.key ? "#C9A96E22" : "transparent",
                color: filter === f.key ? "#C9A96E" : "#888", cursor: "pointer",
              }}>
              {f.label}
            </button>
          ))}
          <input
            defaultValue={search}
            placeholder="بحث برقم الطلب..."
            onKeyDown={(e) => { if (e.key === "Enter") setParams({ filter, q: e.target.value }); }}
            style={{
              marginRight: "auto", padding: "6px 14px", borderRadius: 8,
              border: "1px solid #333", background: "#111", color: "#fff", fontSize: 13, outline: "none",
            }}
          />
          <div style={{ color: "#666", fontSize: 13 }}>{orders.length} طلب</div>
        </div>
      </s-section>

      {/* Orders Table */}
      <s-section>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #2a2a2a" }}>
                {["#", "العميل / الولاية", "المنتجات", "المبلغ", "الدفع", "الشحن", "التاريخ", "إجراء"].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "right", color: "#666", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const wilaya = order.customAttributes?.find((a) => a.key === "Wilaya")?.value;
                const fullName = order.customAttributes?.find((a) => a.key === "Full Name")?.value;
                const customerName = fullName || (order.customer ? `${order.customer.firstName || ""} ${order.customer.lastName || ""}`.trim() : null) || wilaya || "—";
                const items = order.lineItems.edges.map((e) => `${e.node.title}${e.node.variant?.title && e.node.variant.title !== "Default Title" ? ` (${e.node.variant.title})` : ""} ×${e.node.quantity}`).join("، ");
                const canFulfill = order.displayFulfillmentStatus === "UNFULFILLED";
                const canCancel = !["CANCELLED", "FULFILLED"].includes(order.displayFulfillmentStatus);

                return (
                  <tr key={order.id} style={{ borderBottom: "1px solid #1a1a1a" }}>
                    <td style={{ padding: "12px 14px" }}>
                      <a href={`/app/orders/${order.id.split("/").pop()}`} style={{ color: "#C9A96E", textDecoration: "none", fontWeight: 700 }}>
                        {order.name}
                      </a>
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ color: "#ddd", fontWeight: 600 }}>{customerName}</div>
                      {wilaya && <div style={{ color: "#666", fontSize: 11 }}>{wilaya}</div>}
                    </td>
                    <td style={{ padding: "12px 14px", color: "#888", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{items}</td>
                    <td style={{ padding: "12px 14px", color: "#C9A96E", fontWeight: 700 }}>
                      {parseFloat(order.totalPriceSet.shopMoney.amount).toLocaleString()} {order.totalPriceSet.shopMoney.currencyCode}
                    </td>
                    <td style={{ padding: "12px 14px" }}><Badge status={order.displayFinancialStatus} /></td>
                    <td style={{ padding: "12px 14px" }}><Badge status={order.displayFulfillmentStatus} /></td>
                    <td style={{ padding: "12px 14px", color: "#666" }}>
                      {new Date(order.createdAt).toLocaleDateString("ar-DZ")}
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        {canFulfill && (
                          <fetcher.Form method="post">
                            <input type="hidden" name="intent" value="fulfill" />
                            <input type="hidden" name="orderId" value={order.id} />
                            <input type="hidden" name="lineItems" value={JSON.stringify([])} />
                            <button type="submit" style={{ padding: "4px 10px", borderRadius: 6, background: "#22c55e22", color: "#22c55e", border: "1px solid #22c55e55", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
                              شحن
                            </button>
                          </fetcher.Form>
                        )}
                        {canCancel && (
                          <fetcher.Form method="post">
                            <input type="hidden" name="intent" value="cancel" />
                            <input type="hidden" name="orderId" value={order.id} />
                            <button type="submit" onClick={(e) => { if (!confirm("تأكيد إلغاء الطلب؟")) e.preventDefault(); }}
                              style={{ padding: "4px 10px", borderRadius: 6, background: "#ef444422", color: "#ef4444", border: "1px solid #ef444455", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
                              إلغاء
                            </button>
                          </fetcher.Form>
                        )}
                        <a href={`/app/orders/${order.id.split("/").pop()}`}
                          style={{ padding: "4px 10px", borderRadius: 6, background: "#3b82f622", color: "#3b82f6", border: "1px solid #3b82f655", fontSize: 11, textDecoration: "none", fontWeight: 600 }}>
                          تفاصيل
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {orders.length === 0 && (
            <div style={{ padding: 40, textAlign: "center", color: "#444" }}>لا توجد طلبات</div>
          )}
        </div>
      </s-section>
    </s-page>
  );
}

export const headers = (h) => boundary.headers(h);

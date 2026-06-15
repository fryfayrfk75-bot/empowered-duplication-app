import { useLoaderData, useSearchParams } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const search = url.searchParams.get("q") || "";

  const query = search
    ? `first: 50, query: "email:*${search}* OR first_name:*${search}* OR last_name:*${search}* OR phone:*${search}*"`
    : `first: 50, sortKey: CREATED_AT, reverse: true`;

  const res = await admin.graphql(`#graphql
    query customers {
      customers(${query}) {
        edges {
          node {
            id firstName lastName email phone
            numberOfOrders
            totalSpentV2 { amount currencyCode }
            createdAt
            defaultAddress { city province country }
            tags
          }
        }
      }
    }
  `);

  const data = await res.json();
  return { customers: data.data.customers.edges.map((e) => e.node), search };
};

export default function Customers() {
  const { customers, search } = useLoaderData();
  const [, setParams] = useSearchParams();

  return (
    <s-page heading="العملاء">
      <s-section>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
          <input
            defaultValue={search}
            placeholder="بحث بالاسم أو الهاتف أو البريد..."
            onKeyDown={(e) => { if (e.key === "Enter") setParams({ q: e.target.value }); }}
            style={{ flex: 1, minWidth: 200, padding: "8px 14px", borderRadius: 8, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 13, outline: "none" }}
          />
          <div style={{ color: "#666", fontSize: 13 }}>{customers.length} عميل</div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #2a2a2a" }}>
                {["الاسم", "الهاتف / البريد", "الموقع", "الطلبات", "الإنفاق الكلي", "تاريخ التسجيل"].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "right", color: "#666", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => {
                const name = `${c.firstName || ""} ${c.lastName || ""}`.trim() || "—";
                const location = c.defaultAddress
                  ? [c.defaultAddress.city, c.defaultAddress.country].filter(Boolean).join("، ")
                  : "—";
                return (
                  <tr key={c.id} style={{ borderBottom: "1px solid #1a1a1a" }}>
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ fontWeight: 700, color: "#fff" }}>{name}</div>
                      {c.tags?.length > 0 && (
                        <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                          {c.tags.slice(0, 3).map((tag) => (
                            <span key={tag} style={{ background: "#C9A96E22", color: "#C9A96E", border: "1px solid #C9A96E44", borderRadius: 4, padding: "1px 6px", fontSize: 10 }}>{tag}</span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      {c.phone && <div style={{ color: "#ccc" }}>{c.phone}</div>}
                      {c.email && <div style={{ color: "#666", fontSize: 12 }}>{c.email}</div>}
                    </td>
                    <td style={{ padding: "12px 14px", color: "#888" }}>{location}</td>
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{ background: "#3b82f622", color: "#3b82f6", border: "1px solid #3b82f655", borderRadius: 4, padding: "2px 8px", fontSize: 12, fontWeight: 600 }}>
                        {c.numberOfOrders}
                      </span>
                    </td>
                    <td style={{ padding: "12px 14px", color: "#C9A96E", fontWeight: 700 }}>
                      {parseFloat(c.totalSpentV2.amount).toLocaleString()} {c.totalSpentV2.currencyCode}
                    </td>
                    <td style={{ padding: "12px 14px", color: "#666" }}>
                      {new Date(c.createdAt).toLocaleDateString("ar-DZ")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {customers.length === 0 && (
            <div style={{ padding: 40, textAlign: "center", color: "#444" }}>لا يوجد عملاء</div>
          )}
        </div>
      </s-section>
    </s-page>
  );
}

export const headers = (h) => boundary.headers(h);
